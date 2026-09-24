-- ============================================================================
-- 0010_import.sql
-- Import pipeline: batches, staged rows, duplicates, and errors. The
-- shape here is deliberately two-phase to match spec sections 21-28:
--
--   Phase A (application code, src/app/api/import/process): parse the
--   CSV/XLSX client-side-preview, run required-column validation, resolve
--   city/platform/source names to ids, and insert one import_rows row per
--   VALID row (result='pending'). Invalid rows go straight to
--   import_errors and are never staged.
--
--   Phase B (process_import_batch(), this file): a single SQL pass over
--   the staged rows that (1) marks duplicates found INSIDE the file,
--   keeping only the first occurrence, (2) marks rows that already exist
--   in the target table, (3) inserts everything left over into the real
--   target (leads / directory_records / hc_leads) — never touching or
--   overwriting an existing row (spec section 26).
-- ============================================================================

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  target text not null check (target in ('leads', 'directory', 'hc_leads')),
  directory_id uuid references directories(id),   -- required when target = 'directory'
  platform_id uuid references platforms(id),       -- batch-level default platform (import flow: Preview -> Platform -> Source)
  source_id uuid references sources(id),
  file_name text not null,
  file_type text not null check (file_type in ('csv', 'xlsx')),
  imported_by uuid not null references profiles(id),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  total_rows int not null default 0,
  valid_rows int not null default 0,
  imported_rows int not null default 0,
  duplicate_in_file_rows int not null default 0,
  existing_rows int not null default 0,
  failed_rows int not null default 0,
  imported_at timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_import_batches_product on import_batches(product_id, imported_at desc);
create index idx_import_batches_imported_by on import_batches(imported_by);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number int not null,
  name text not null,
  mobile text not null,
  alternate_mobile text,
  vehicle_number text,
  dl_number text,
  license_number text,
  city_id uuid references cities(id),
  platform_id uuid references platforms(id),
  source_id uuid references sources(id),
  raw jsonb not null default '{}'::jsonb,
  result text not null default 'pending'
    check (result in ('pending', 'imported', 'duplicate_in_file', 'existing_lead', 'failed')),
  lead_id uuid references leads(id),
  directory_record_id uuid references directory_records(id),
  error_message text,
  created_at timestamptz not null default now()
);
create index idx_import_rows_batch on import_rows(batch_id, row_number);
create index idx_import_rows_mobile on import_rows(batch_id, mobile);

-- Keep import_rows.mobile normalized the same way leads/hc_leads already
-- are (normalize_phone(), defined in 0012). Without this, the in-file
-- dedup key below and process_import_batch()'s "already exists in the
-- target table" check would compare un-normalized staged numbers against
-- already-normalized leads.mobile/hc_leads.mobile and silently miss real
-- duplicates whenever the uploaded file formats phones differently (e.g.
-- "+91 98450 11223" vs "9845011223" — spec section 24's whole point). A
-- forward reference to normalize_phone() is safe: this trigger function's
-- body isn't resolved until a row is actually inserted, long after every
-- migration has run — the same pattern already used by update_hc_lead_status
-- (0010) referencing hc_product_id() (0014).
create or replace function normalize_import_row_mobile()
returns trigger
language plpgsql
as $$
begin
  new.mobile := normalize_phone(new.mobile);
  if new.alternate_mobile is not null and length(trim(new.alternate_mobile)) > 0 then
    new.alternate_mobile := normalize_phone(new.alternate_mobile);
  end if;
  return new;
end;
$$;
create trigger trg_import_rows_normalize_mobile before insert or update of mobile, alternate_mobile on import_rows
  for each row execute function normalize_import_row_mobile();

create table import_duplicates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number int not null,
  duplicate_type text not null check (duplicate_type in ('in_file', 'existing_lead')),
  driver_name text not null,
  contact text not null,
  vehicle_number text,
  dl_number text,
  license_number text,
  existing_lead_id uuid references leads(id),
  existing_status_id uuid references statuses(id),
  product_id uuid not null references products(id),
  platform_id uuid references platforms(id),
  city_id uuid references cities(id),
  source_id uuid references sources(id),
  detected_at timestamptz not null default now(),
  imported_by uuid references profiles(id)
);
create index idx_import_duplicates_batch on import_duplicates(batch_id);
create index idx_import_duplicates_product on import_duplicates(product_id, detected_at desc);
create index idx_import_duplicates_contact on import_duplicates(contact);

create table import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number int not null,
  column_name text,
  error_message text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index idx_import_errors_batch on import_errors(batch_id);

alter table leads
  add constraint fk_leads_import_batch foreign key (import_batch_id) references import_batches(id);
alter table hc_leads
  add constraint fk_hc_leads_import_batch foreign key (import_batch_id) references import_batches(id);
create index idx_hc_leads_import_batch on hc_leads(import_batch_id);

-- ----------------------------------------------------------------------------
-- The dedup key: phone is primary; vehicle/DL/license only enter the key
-- when the phone itself is blank (spec: "do NOT use Driver Name alone").
-- ----------------------------------------------------------------------------
create or replace function import_row_dedup_key(
  p_mobile text, p_vehicle text, p_dl text, p_license text
) returns text
language sql immutable
as $$
  select case
    when nullif(trim(p_mobile), '') is not null then 'M:' || trim(p_mobile)
    else 'V:' || coalesce(trim(p_vehicle), '') || '|D:' || coalesce(trim(p_dl), '') || '|L:' || coalesce(trim(p_license), '')
  end;
$$;

create or replace function process_import_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch import_batches%rowtype;
  v_row record;
  v_existing_lead_id uuid;
  v_existing_status_id uuid;
  v_existing_directory_record_id uuid;
  v_new_status_id uuid;
  v_new_id uuid;
  v_imported int := 0;
  v_dup_file int := 0;
  v_existing int := 0;
  v_failed int := 0;
begin
  select * into v_batch from import_batches where id = p_batch_id;
  if v_batch is null then
    raise exception 'import_batch % not found', p_batch_id;
  end if;

  -- Step 1: duplicates INSIDE the file — keep the first row_number per key.
  with keyed as (
    select id, row_number,
           import_row_dedup_key(mobile, vehicle_number, dl_number, license_number) as dkey,
           row_number() over (
             partition by import_row_dedup_key(mobile, vehicle_number, dl_number, license_number)
             order by row_number asc
           ) as rn
    from import_rows
    where batch_id = p_batch_id and result = 'pending'
  )
  update import_rows ir
  set result = 'duplicate_in_file'
  from keyed k
  where ir.id = k.id and k.rn > 1;

  insert into import_duplicates
    (batch_id, row_number, duplicate_type, driver_name, contact, vehicle_number, dl_number,
     license_number, product_id, platform_id, city_id, source_id, imported_by)
  select v_batch.id, ir.row_number, 'in_file', ir.name, ir.mobile, ir.vehicle_number, ir.dl_number,
         ir.license_number, v_batch.product_id, ir.platform_id, ir.city_id, ir.source_id, v_batch.imported_by
  from import_rows ir
  where ir.batch_id = p_batch_id and ir.result = 'duplicate_in_file';

  get diagnostics v_dup_file = row_count;

  -- Step 2 + 3: for every row still pending, check "already exists" against
  -- the real target, then insert if genuinely new. Row-by-row because each
  -- insert must know whether IT specifically is a duplicate of the target
  -- table OR of a row this same loop already inserted moments ago.
  for v_row in
    select * from import_rows where batch_id = p_batch_id and result = 'pending' order by row_number asc
  loop
    v_existing_lead_id := null;
    v_existing_status_id := null;
    v_existing_directory_record_id := null;

    if v_batch.target = 'leads' then
      select id, status_id into v_existing_lead_id, v_existing_status_id
      from leads
      where product_id = v_batch.product_id and mobile = v_row.mobile
      limit 1;
    elsif v_batch.target = 'directory' then
      select id into v_existing_directory_record_id
      from directory_records
      where directory_id = v_batch.directory_id and mobile = v_row.mobile
      limit 1;
    elsif v_batch.target = 'hc_leads' then
      select id into v_existing_lead_id
      from hc_leads
      where mobile = v_row.mobile
      limit 1;
    end if;

    if v_existing_lead_id is not null or v_existing_directory_record_id is not null then
      update import_rows set result = 'existing_lead' where id = v_row.id;
      insert into import_duplicates
        (batch_id, row_number, duplicate_type, driver_name, contact, vehicle_number, dl_number,
         license_number, existing_lead_id, existing_status_id, product_id, platform_id, city_id,
         source_id, imported_by)
      values
        (v_batch.id, v_row.row_number, 'existing_lead', v_row.name, v_row.mobile, v_row.vehicle_number,
         v_row.dl_number, v_row.license_number, v_existing_lead_id, v_existing_status_id, v_batch.product_id,
         v_row.platform_id, v_row.city_id, v_row.source_id, v_batch.imported_by);
      v_existing := v_existing + 1;
      continue;
    end if;

    -- Genuinely new: insert into the real target. Never touches an
    -- existing row — this branch only runs when no match was found above.
    if v_batch.target = 'leads' then
      select ps.status_id into v_new_status_id
      from platform_statuses ps join statuses s on s.id = ps.status_id
      where ps.product_id = v_batch.product_id and ps.platform_id = v_row.platform_id
        and s.is_default_for_new and ps.is_active
      limit 1;

      insert into leads (product_id, platform_id, city_id, source_id, status_id,
                          name, mobile, mobile_display, alternate_mobile, import_batch_id, created_by)
      values (v_batch.product_id, v_row.platform_id, v_row.city_id, v_row.source_id,
              coalesce(v_new_status_id, (select id from statuses where is_default_for_new limit 1)),
              v_row.name, v_row.mobile, v_row.mobile, v_row.alternate_mobile, v_batch.id, v_batch.imported_by)
      returning id into v_new_id;

      update import_rows set result = 'imported', lead_id = v_new_id where id = v_row.id;

    elsif v_batch.target = 'directory' then
      insert into directory_records (directory_id, product_id, name, mobile, alternate_mobile,
                                      vehicle_number, dl_number, license_number, city_id, platform_id,
                                      source_id, raw_data, created_by)
      values (v_batch.directory_id, v_batch.product_id, v_row.name, v_row.mobile, v_row.alternate_mobile,
              v_row.vehicle_number, v_row.dl_number, v_row.license_number, v_row.city_id, v_row.platform_id,
              v_row.source_id, v_row.raw, v_batch.imported_by)
      returning id into v_new_id;

      update import_rows set result = 'imported', directory_record_id = v_new_id where id = v_row.id;

    elsif v_batch.target = 'hc_leads' then
      -- total_trips has no dedicated import_rows column (it's HC-only, not
      -- shared with leads/directory) — pulled from the staged raw jsonb
      -- instead, defaulting to 0 when absent or not a valid integer.
      insert into hc_leads (mobile, mobile_display, driver_name, vehicle_number, dl_number,
                             license_number, city_id, platform_id, status_id, total_trips, import_batch_id, created_by)
      values (v_row.mobile, v_row.mobile, v_row.name, v_row.vehicle_number, v_row.dl_number,
              v_row.license_number, v_row.city_id, v_row.platform_id,
              (select id from statuses where code = 'tag_added'),
              coalesce(nullif(regexp_replace(coalesce(v_row.raw->>'total_trips', ''), '\D', '', 'g'), '')::int, 0),
              v_batch.id, v_batch.imported_by)
      returning id into v_new_id;

      update import_rows set result = 'imported' where id = v_row.id;
    end if;

    v_imported := v_imported + 1;
  end loop;

  select count(*) into v_failed from import_errors where batch_id = p_batch_id;

  update import_batches
  set status = 'completed',
      completed_at = now(),
      imported_rows = v_imported,
      duplicate_in_file_rows = v_dup_file,
      existing_rows = v_existing,
      failed_rows = v_failed,
      valid_rows = v_imported + v_dup_file + v_existing
  where id = p_batch_id;
end;
$$;

comment on function process_import_batch(uuid) is
  'Runs once per import, after all valid rows are staged into import_rows. Never overwrites an existing lead/directory_record/hc_lead — matches never re-runs are safe (result already != pending is skipped).';

-- process_import_batch is invoked by src/app/api/import/process using the
-- SERVICE ROLE, only after that route handler has independently verified
-- (in TypeScript, against the caller's own session) that the caller is
-- Admin or a Manager with access to the batch's product. It is not meant
-- to be called directly from the browser.
revoke execute on function process_import_batch(uuid) from public, anon, authenticated;
grant execute on function process_import_batch(uuid) to service_role;
