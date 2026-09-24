-- ============================================================================
-- 0009_directory.sql
-- Directory is deliberately separate from Leads (spec section 62): a
-- directory_record only becomes a lead through an explicit "Convert to
-- Lead" action or the import pipeline choosing target='leads', and when it
-- does, the origin (directory_id/directory_record_id) is preserved on the
-- resulting leads row.
-- ============================================================================

create table directories (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);
create index idx_directories_product on directories(product_id);
create trigger trg_directories_updated_at before update on directories
  for each row execute function set_updated_at();

create table directory_records (
  id uuid primary key default gen_random_uuid(),
  directory_id uuid not null references directories(id) on delete cascade,
  product_id uuid not null references products(id),  -- denormalized for RLS/index speed
  name text not null,
  mobile text not null,
  alternate_mobile text,
  vehicle_number text,
  dl_number text,
  license_number text,
  city_id uuid references cities(id),
  platform_id uuid references platforms(id),
  source_id uuid references sources(id),
  status_id uuid references statuses(id),
  raw_data jsonb,                    -- any extra imported columns not mapped to named fields
  converted_to_lead_id uuid references leads(id),
  converted_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_directory_records_directory on directory_records(directory_id);
create index idx_directory_records_product on directory_records(product_id);
create index idx_directory_records_mobile on directory_records(mobile);
create index idx_directory_records_status on directory_records(status_id);
create index idx_directory_records_created_at on directory_records(created_at desc);
create trigger trg_directory_records_updated_at before update on directory_records
  for each row execute function set_updated_at();

alter table leads
  add constraint fk_leads_directory foreign key (directory_id) references directories(id),
  add constraint fk_leads_directory_record foreign key (directory_record_id) references directory_records(id);

-- ----------------------------------------------------------------------------
-- Convert a directory record into a real lead, preserving its origin and
-- routing it through the same round-robin assignment every new lead gets
-- (the AFTER INSERT trigger on leads from 0007 fires normally).
-- ----------------------------------------------------------------------------
create or replace function convert_directory_record_to_lead(
  p_record_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rec directory_records%rowtype;
  v_status_id uuid;
  v_new_lead_id uuid;
begin
  select * into v_rec from directory_records where id = p_record_id;
  if v_rec is null then
    raise exception 'directory_record % not found', p_record_id;
  end if;

  if v_actor is not null and not (is_admin() or (is_manager() and has_product_access(v_rec.product_id))) then
    raise exception 'not authorized to convert directory_record %', p_record_id;
  end if;

  if v_rec.converted_to_lead_id is not null then
    return v_rec.converted_to_lead_id; -- idempotent
  end if;

  select status_id into v_status_id
  from platform_statuses ps
  join statuses s on s.id = ps.status_id
  where ps.product_id = v_rec.product_id and ps.platform_id = v_rec.platform_id
    and s.is_default_for_new and ps.is_active
  limit 1;

  insert into leads (
    product_id, platform_id, city_id, source_id, status_id,
    name, mobile, mobile_display, alternate_mobile,
    directory_id, directory_record_id, created_by
  ) values (
    v_rec.product_id, v_rec.platform_id, v_rec.city_id, v_rec.source_id,
    coalesce(v_status_id, v_rec.status_id),
    v_rec.name, v_rec.mobile, v_rec.mobile, v_rec.alternate_mobile,
    v_rec.directory_id, v_rec.id, v_actor
  ) returning id into v_new_lead_id;

  update directory_records
  set converted_to_lead_id = v_new_lead_id, converted_at = now()
  where id = p_record_id;

  return v_new_lead_id;
end;
$$;

revoke execute on function convert_directory_record_to_lead(uuid) from public, anon;
grant execute on function convert_directory_record_to_lead(uuid) to authenticated, service_role;
