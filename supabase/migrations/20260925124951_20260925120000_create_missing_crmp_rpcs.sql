/*
# Create Missing CRM RPCs for Frontend Compatibility

## Purpose
The frontend code calls several RPCs that don't exist in the current database.
This migration creates them, matching the live schema (using `mobile`, `assigned_caller_id`,
`caller_queue` singular table, `platform_statuses`, `statuses` with UUID IDs, etc.).

## New Functions
1. `bulk_import_leads(jsonb)` — Inserts leads from import payload, sets mobile+phone, triggers auto-assignment via the existing AFTER INSERT trigger.
2. `bulk_auto_assign_imported_leads(uuid)` — Re-assigns any unassigned leads for a product using caller_queue round-robin.
3. `admin_bulk_assign_leads(uuid[], uuid)` — Bulk-assigns leads to a single caller (admin only).

## Modified Functions
- None modified. All are new CREATE OR REPLACE.

## Security
- All functions are SECURITY DEFINER with search_path = 'public'.
- `bulk_import_leads` granted to authenticated (used by import flow).
- `bulk_auto_assign_imported_leads` granted to authenticated.
- `admin_bulk_assign_leads` granted to authenticated (gated by is_admin() internally).

## Important Notes
1. `bulk_import_leads` inserts into `mobile` (NOT NULL) and also sets `phone` for compatibility.
2. The existing AFTER INSERT trigger `trg_leads_auto_assign` handles caller queue assignment automatically.
3. `bulk_auto_assign_imported_leads` handles the case where the trigger didn't assign anyone (no active queue members).
4. Platform names in the payload (e.g. "UBER") are resolved to platform UUIDs via the `platforms` table.
*/

-- ============================================================================
-- 1. bulk_import_leads
-- ============================================================================
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
        -- Also try matching by platform name
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
      v_errors := array_append(v_errors, jsonb_build_object('row', v_row, 'error', SQLERRM));
    end;
  end loop;

  return jsonb_build_object(
    'imported', v_imported,
    'failed', v_failed,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_import_leads(jsonb) TO authenticated;

-- ============================================================================
-- 2. bulk_auto_assign_imported_leads
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bulk_auto_assign_imported_leads(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
declare
  v_lead_id uuid;
  v_queue_id uuid;
  v_last_member_id uuid;
  v_next_employee_id uuid;
  v_assigned int := 0;
  v_admin_review int := 0;
  v_ringing_status_id uuid;
  v_platform_id uuid;
begin
  -- Get the caller queue for this product
  select id, last_assigned_member_id into v_queue_id, v_last_member_id
  from caller_queue where product_id = p_product_id and is_active
  limit 1;

  -- If no queue exists, mark all unassigned leads as admin_review
  if v_queue_id is null then
    update leads set in_admin_review = true, needs_admin_review = true
    where product_id = p_product_id
      and assigned_caller_id is null
      and current_caller_id is null
      and is_active = true;
    get diagnostics v_admin_review = row_count;
    return jsonb_build_object('assigned', 0, 'admin_review', v_admin_review);
  end if;

  -- Get ringing status for this product
  v_ringing_status_id := null;

  -- Loop through unassigned leads
  for v_lead_id in
    select id from leads
    where product_id = p_product_id
      and assigned_caller_id is null
      and current_caller_id is null
      and is_active = true
      and in_admin_review = false
    order by created_at asc
  loop
    -- Find next queue member (round-robin)
    select cqm.employee_id into v_next_employee_id
    from caller_queue_members cqm
    where cqm.queue_id = v_queue_id
      and cqm.is_active = true
      and cqm.position > coalesce(
        (select position from caller_queue_members where id = v_last_member_id), -1
      )
    order by cqm.position asc
    limit 1;

    -- Wrap around
    if v_next_employee_id is null then
      select cqm.employee_id into v_next_employee_id
      from caller_queue_members cqm
      where cqm.queue_id = v_queue_id and cqm.is_active = true
      order by cqm.position asc
      limit 1;
    end if;

    if v_next_employee_id is null then
      -- No active callers — send to admin review
      update leads set in_admin_review = true, needs_admin_review = true
      where id = v_lead_id;
      v_admin_review := v_admin_review + 1;
    else
      -- Assign the lead
      update leads set
        assigned_caller_id = v_next_employee_id,
        current_caller_id = v_next_employee_id,
        assigned_at = now(),
        in_admin_review = false,
        needs_admin_review = false
      where id = v_lead_id;

      -- Update queue pointer
      update caller_queue set last_assigned_member_id = (
        select cqm.id from caller_queue_members cqm
        where cqm.queue_id = v_queue_id and cqm.employee_id = v_next_employee_id
        limit 1
      ) where id = v_queue_id;

      v_last_member_id := (select cqm.id from caller_queue_members cqm
        where cqm.queue_id = v_queue_id and cqm.employee_id = v_next_employee_id limit 1);

      -- Try to set ringing status
      select ps.status_id into v_ringing_status_id
      from platform_statuses ps
      join statuses s on s.id = ps.status_id
      where ps.product_id = p_product_id
        and ps.platform_id = (select platform_id from leads where id = v_lead_id)
        and s.is_ringing and ps.is_active
      limit 1;

      if v_ringing_status_id is not null then
        begin
          perform update_lead_status(v_lead_id, v_ringing_status_id, 'Auto-assigned from import');
        exception when others then
          null;
        end;
      end if;

      v_assigned := v_assigned + 1;
    end if;
  end loop;

  return jsonb_build_object('assigned', v_assigned, 'admin_review', v_admin_review);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_auto_assign_imported_leads(uuid) TO authenticated;

-- ============================================================================
-- 3. admin_bulk_assign_leads
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_bulk_assign_leads(
  p_lead_ids uuid[],
  p_new_caller_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
declare
  v_lead_id uuid;
  v_product_id uuid;
  v_assigned int := 0;
  v_skipped int := 0;
  v_skipped_ids uuid[] := ARRAY[]::uuid[];
begin
  if not is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Validate caller is active and in a queue
  if not exists (
    select 1 from profiles where id = p_new_caller_id and is_active = true
  ) then
    raise exception 'Selected caller is not active';
  end if;

  foreach v_lead_id in array p_lead_ids
  loop
    begin
      select product_id into v_product_id from leads where id = v_lead_id;
      if v_product_id is null then
        v_skipped := v_skipped + 1;
        v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
        continue;
      end if;

      -- Check caller is in the product's queue
      if not exists (
        select 1 from caller_queue_members cqm
        join caller_queue cq on cq.id = cqm.queue_id
        where cq.product_id = v_product_id
          and cqm.employee_id = p_new_caller_id
          and cqm.is_active = true
      ) then
        v_skipped := v_skipped + 1;
        v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
        continue;
      end if;

      -- Assign
      perform admin_reassign_caller(v_lead_id, p_new_caller_id, 'Bulk manual assignment');
      v_assigned := v_assigned + 1;
    exception when others then
      v_skipped := v_skipped + 1;
      v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
    end;
  end loop;

  return jsonb_build_object(
    'assigned_count', v_assigned,
    'skipped_count', v_skipped,
    'skipped_lead_ids', to_jsonb(v_skipped_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_assign_leads(uuid[], uuid) TO authenticated;

-- ============================================================================
-- 4. admin_bulk_equally_assign_leads (recreate matching live schema)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_bulk_equally_assign_leads(
  p_lead_ids uuid[],
  p_caller_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
declare
  v_lead_id uuid;
  v_product_id uuid;
  v_caller_idx int := 0;
  v_caller_count int;
  v_caller_id uuid;
  v_assigned int := 0;
  v_skipped int := 0;
  v_skipped_ids uuid[] := ARRAY[]::uuid[];
begin
  if not is_admin() then
    raise exception 'Admin access required';
  end if;

  v_caller_count := array_length(p_caller_ids, 1);
  if v_caller_count is null or v_caller_count = 0 then
    raise exception 'No callers selected';
  end if;

  -- Validate all callers are active
  if not exists (
    select 1 from profiles
    where id = any(p_caller_ids) and is_active = true
    having count(*) = v_caller_count
  ) then
    raise exception 'One or more selected callers are not active';
  end if;

  foreach v_lead_id in array p_lead_ids
  loop
    begin
      v_caller_idx := (v_caller_idx % v_caller_count) + 1;
      v_caller_id := p_caller_ids[v_caller_idx];

      select product_id into v_product_id from leads where id = v_lead_id and is_active = true;
      if v_product_id is null then
        v_skipped := v_skipped + 1;
        v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
        continue;
      end if;

      -- Check caller is in the product's queue
      if not exists (
        select 1 from caller_queue_members cqm
        join caller_queue cq on cq.id = cqm.queue_id
        where cq.product_id = v_product_id
          and cqm.employee_id = v_caller_id
          and cqm.is_active = true
      ) then
        v_skipped := v_skipped + 1;
        v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
        continue;
      end if;

      -- Skip if already assigned to same caller
      if exists (
        select 1 from leads where id = v_lead_id and assigned_caller_id = v_caller_id
      ) then
        v_skipped := v_skipped + 1;
        v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
        continue;
      end if;

      perform admin_reassign_caller(v_lead_id, v_caller_id, 'Bulk equal assignment');
      v_assigned := v_assigned + 1;
    exception when others then
      v_skipped := v_skipped + 1;
      v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
    end;
  end loop;

  return jsonb_build_object(
    'assigned_count', v_assigned,
    'skipped_count', v_skipped,
    'skipped_lead_ids', to_jsonb(v_skipped_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_equally_assign_leads(uuid[], uuid[]) TO authenticated;