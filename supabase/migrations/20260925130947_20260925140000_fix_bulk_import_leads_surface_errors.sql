/*
# Fix bulk_import_leads — surface errors instead of swallowing them

## Root Cause
The RPC's `exception when others` block catches ALL errors and just increments v_failed.
When called via PostgREST (Supabase JS client), some rows fail silently.
The frontend never sees the error and reports "COMPLETED" with 0 imported.

## Fix
1. Still catch exceptions per-row to allow partial imports
2. But include the FULL error message in the returned errors array
3. Add a counter for the first error so the frontend can display it
*/

CREATE OR REPLACE FUNCTION public.bulk_import_leads(p_leads jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
declare
  v_row jsonb;
  v_lead_id uuid;
  v_product_id uuid;
  v_platform_id uuid;
  v_city_id uuid;
  v_source_id uuid;
  v_status_id uuid;
  v_imported int := 0;
  v_failed int := 0;
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
      v_status_code := coalesce(v_row->>'status', 'NEW');

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

      -- Resolve city name to UUID
      v_city_id := null;
      if v_city_name is not null and v_city_name <> '' then
        select id into v_city_id
        from product_cities
        where product_id = v_product_id
          and upper(city_name) = upper(v_city_name)
        limit 1;
      end if;

      -- Resolve source name to UUID
      v_source_id := null;
      if v_source_name is not null and v_source_name <> '' then
        select id into v_source_id from sources where upper(name) = upper(v_source_name) limit 1;
      end if;

      -- Resolve status code to UUID
      v_status_id := null;
      select id into v_status_id from statuses where lower(code) = lower(v_status_code) limit 1;
      if v_status_id is null then
        select id into v_status_id from statuses where is_default_for_new limit 1;
      end if;

      -- Check for existing lead by mobile for this product
      v_existing_id := null;
      select id into v_existing_id
      from leads
      where product_id = v_product_id and mobile = v_row->>'phone'
      limit 1;

      if v_existing_id is not null then
        v_failed := v_failed + 1;
        v_errors := array_append(v_errors, jsonb_build_object('row', v_row, 'error', 'duplicate', 'existing_id', v_existing_id));
        if v_first_error is null then
          v_first_error := 'Duplicate lead: phone ' || v_row->>'phone' || ' already exists';
        end if;
        continue;
      end if;

      -- Insert the lead
      insert into leads (
        product_id, platform_id, city_id, source_id, status_id,
        name, mobile, mobile_display, phone, platform, city, source, status,
        vehicle_no, dl_no, total_trips, license_no, last_trip_date,
        is_active, in_admin_review, rotation_count,
        created_by
      ) values (
        v_product_id,
        v_platform_id,
        v_city_id,
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
        (v_row->>'created_by')::uuid
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
    'first_error', v_first_error,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_leads(jsonb) TO authenticated;