/*
# Fix HC Import Default Status — NULL instead of TAG_ADDED/RINGING

## Problem
HC leads imported via `bulk_import_leads` were getting `status = 'TAG_ADDED'`
because the original RPC fell back to `is_default_for_new` when no status was
provided, and the `tag_added` status row had `is_default_for_new = true`.

A later migration (20260929130228) tried to fix this by defaulting to 'RINGING'
instead, but that is also wrong — HC leads should have NO status until a user
manually selects one.

## Fix
1. Rewrite `bulk_import_leads`: when no status is provided, insert NULL for
   both `status` (text) and `status_id` (uuid). Only resolve a status when the
   caller explicitly provides one.
2. Correct the 16 existing HC test leads that were auto-assigned TAG_ADDED by
   the broken import. These leads have zero status history, zero assignments,
   and no caller — confirming no human ever set their status. Set their status
   and status_id to NULL.

## Safety
- No schema changes (no columns added/dropped/renamed).
- No RLS policies changed.
- Only the RPC function definition and 16 data rows change.
- The function is `CREATE OR REPLACE` — idempotent.
*/

-- ============================================================
-- 1. Rewrite bulk_import_leads — NULL status when not provided
-- ============================================================
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

      -- Do NOT default status to TAG_ADDED or RINGING.
      -- When no status is provided, insert NULL.

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

      -- Resolve status code to UUID — only when a status is explicitly provided
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

-- ============================================================
-- 2. Correct the 16 HC test leads that were auto-assigned
--    TAG_ADDED by the broken import. These leads have:
--    - zero status history entries
--    - zero lead_assignments entries
--    - current_caller_id IS NULL
--    confirming no human ever set their status.
-- ============================================================
UPDATE leads
SET status = NULL,
    status_id = NULL,
    updated_at = now()
WHERE product_id = '93dbf105-c254-45d9-acac-490278326b97'
  AND status = 'TAG_ADDED'
  AND current_caller_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM lead_status_history h WHERE h.lead_id = leads.id)
  AND NOT EXISTS (SELECT 1 FROM lead_assignments a WHERE a.lead_id = leads.id);
