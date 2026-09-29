/*
# Fix HC Lead Default Status — NULL instead of TAG_ADDED/NEW

## Problem
New HC leads were getting `status = 'TAG_ADDED'` (or `'NEW'`) on import
instead of `NULL` (which displays as "—" in the UI). Two RPCs were responsible:

1. `bulk_import_leads` — used `coalesce(v_row->>'status', 'NEW')` which
   converted the frontend's null/empty status to 'NEW'. The text `status`
   column was set to 'NEW' and `status_id` was resolved to the `tag_added`
   UUID via the `is_default_for_new` fallback (since there is no status with
   code 'new' in the `statuses` table — actually there IS one now, but the
   original behavior was to fall back to `is_default_for_new` which returned
   `tag_added`).

2. `process_import_batch` — hardcoded `(select id from statuses where code =
   'tag_added')` for every `hc_leads` insert, guaranteeing TAG_ADDED.

## Fix
1. `bulk_import_leads`: When the incoming `status` is null or empty, insert
   `NULL` for both `status` and `status_id` — NOT 'NEW'. When a status IS
   provided, keep the existing resolve-and-insert behavior.

2. `process_import_batch`: For `hc_leads` target, insert `NULL` for
   `status_id` instead of hardcoding `tag_added`.

## Safety
- No schema changes (no columns added/dropped/renamed).
- No data changes (existing leads keep their current status).
- Only RPC function definitions change.
- Both functions are `CREATE OR REPLACE` — idempotent.
*/

-- =====================================================
-- 1. bulk_import_leads — preserve NULL status
-- =====================================================
CREATE OR REPLACE FUNCTION public.bulk_import_leads(p_leads jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_row jsonb;
  v_lead_id uuid;
  v_product_id uuid;
  v_platform_id uuid;
  v_source_id uuid;
  v_status_id uuid;
  v_imported int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_errors jsonb[] := ARRAY[]::jsonb[];
  v_first_error text;
  v_platform_name text;
  v_city_name text;
  v_source_name text;
  v_status_code text;
  v_existing_id uuid;
begin
  for v_row in select * from jsonb_array_elements(p_leads)
  loop
    begin
      v_product_id := (v_row->>'product_id')::uuid;
      v_platform_name := v_row->>'platform';
      v_city_name := v_row->>'city';
      v_source_name := v_row->>'source';
      v_status_code := nullif(v_row->>'status', '');

      -- Resolve platform name to UUID
      v_platform_id := null;
      if v_platform_name is not null and v_platform_name <> '' then
        select pp.platform_id into v_platform_id
        from product_platforms pp
        join platforms pl on pl.id = pp.platform_id
        where pp.product_id = v_product_id
        and pp.is_active = true
        and upper(pl.slug) = upper(v_platform_name)
        limit 1;
        if v_platform_id is null then
          select pp.platform_id into v_platform_id
          from product_platforms pp
          join platforms pl on pl.id = pp.platform_id
          where pp.product_id = v_product_id
          and pp.is_active = true
          and upper(pl.name) = upper(v_platform_name)
          limit 1;
        end if;
      end if;

      -- Resolve source name to UUID
      v_source_id := null;
      if v_source_name is not null and v_source_name <> '' then
        select id into v_source_id from sources where upper(name) = upper(v_source_name) limit 1;
      end if;

      -- Resolve status code to UUID — only when a status is provided
      v_status_id := null;
      if v_status_code is not null then
        select id into v_status_id from statuses where lower(code) = lower(v_status_code) limit 1;
        if v_status_id is null then
          select id into v_status_id from statuses where is_default_for_new limit 1;
        end if;
      end if;

      -- Check for existing lead by phone for this product
      v_existing_id := null;
      select id into v_existing_id
      from leads
      where product_id = v_product_id and phone = v_row->>'phone'
      limit 1;

      if v_existing_id is not null then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Insert the lead — status and status_id are NULL when not provided
      insert into leads (
        product_id, platform_id, source_id, status_id,
        name, mobile, mobile_display, phone, platform, city, source, status,
        vehicle_no, dl_no, total_trips, license_no, last_trip_date,
        is_active, in_admin_review, rotation_count,
        created_by
      ) values (
        v_product_id,
        v_platform_id,
        v_source_id,
        v_status_id,
        v_row->>'name',
        v_row->>'phone',
        v_row->>'phone',
        v_row->>'phone',
        v_platform_name,
        v_city_name,
        v_source_name,
        v_status_code,
        nullif(v_row->>'vehicle_no', ''),
        nullif(v_row->>'dl_no', ''),
        nullif(v_row->>'total_trips', '')::int,
        nullif(v_row->>'license_no', ''),
        nullif(v_row->>'last_trip_date', ''),
        true,
        false,
        0,
        auth.uid()
      )
      returning id into v_lead_id;

      v_imported := v_imported + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, jsonb_build_object('row', v_row, 'error', SQLERRM, 'detail', SQLSTATE));
      if v_first_error is null then
        v_first_error := SQLERRM;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'imported', v_imported,
    'failed', v_failed,
    'skipped', v_skipped,
    'first_error', v_first_error,
    'errors', to_jsonb(v_errors)
  );
END;
$function$;

-- =====================================================
-- 2. process_import_batch — NULL status_id for HC leads
-- =====================================================
CREATE OR REPLACE FUNCTION public.process_import_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Step 1: duplicates INSIDE the file
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

  -- Step 2 + 3: check existing, insert if new
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

    -- Genuinely new: insert into the real target
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
      insert into hc_leads (mobile, mobile_display, driver_name, vehicle_number, dl_number,
                             license_number, city_id, platform_id, status_id, total_trips, import_batch_id, created_by)
      values (v_row.mobile, v_row.mobile, v_row.name, v_row.vehicle_number, v_row.dl_number,
              v_row.license_number, v_row.city_id, v_row.platform_id,
              NULL,
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
$function$;
