/*
# Fix: bulk_import_leads (jsonb) city_id FK violation + caller_queues city FK

## Problem 1: Import fails — every lead insert fails with leads_city_id_fkey violation
The jsonb bulk_import_leads resolves city_id from product_cities (which has valid IDs),
but leads.city_id has FK to cities(id) — a separate empty table.
The product_cities.id values don't exist in cities, so every insert fails.

Fix: Set city_id to NULL in the RPC. The text column `city` already stores the city name.
The city_id FK to cities(id) is a legacy constraint that shouldn't block imports.

## Problem 2: Caller queue insert succeeds but .select() join fails
The query `city:product_cities!city_id(city_name)` fails because there's no FK
from caller_queues.city_id to product_cities.id. PostgREST can't resolve the join.

Fix: Add FK from caller_queues.city_id to product_cities.id.
Also add a unique constraint on (product_id, employee_id, city_id) to prevent
exact duplicates while allowing multi-city assignments.
*/

-- Fix 1: Recreate the jsonb bulk_import_leads to NOT set city_id (FK mismatch)
-- The text `city` column stores the city name; city_id stays NULL.
CREATE OR REPLACE FUNCTION public.bulk_import_leads(p_leads jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

      -- Do NOT resolve city_id — leads.city_id FK references cities(id), not product_cities.id
      -- The text column `city` stores the city name directly.

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

      -- Insert the lead — city_id stays NULL, city text stores the name
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
$$;

-- Fix 2: Add FK from caller_queues.city_id to product_cities.id
ALTER TABLE public.caller_queues
  DROP CONSTRAINT IF EXISTS caller_queues_city_id_fkey;
ALTER TABLE public.caller_queues
  ADD CONSTRAINT caller_queues_city_id_fkey
  FOREIGN KEY (city_id) REFERENCES public.product_cities(id) ON DELETE SET NULL;

-- Add unique constraint on (product_id, employee_id, city_id) to prevent exact duplicates
-- while allowing multi-city assignments for the same employee+product.
-- Use COALESCE to handle NULL city_id (product-wide) uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_caller_queues_unique_prod_emp_city
  ON public.caller_queues (product_id, employee_id, COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid));
