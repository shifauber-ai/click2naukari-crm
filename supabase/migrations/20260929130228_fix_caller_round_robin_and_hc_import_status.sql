/*
# Fix Caller Queue Round-Robin Distribution + HC Import Initial Status

## Problem 1: Caller Queue Distribution (ALL PRODUCTS)
The `assign_new_lead` function always selected the first caller by priority
(`ORDER BY priority ASC LIMIT 1`), so all leads went to Priority 1.
There was no rotation mechanism.

## Fix 1: Round-Robin via Least-Assigned Caller
Rewrite `assign_new_lead` to pick the eligible caller with the fewest
currently-assigned leads for the same product+city+employee_type combo.
This achieves round-robin distribution: the caller who has received the
fewest leads gets the next one. Ties are broken by priority, then created_at.

This works for ALL products (Car, Auto, Tempo, Bike, HC) and respects:
- Product matching
- City matching (including NULL city = all cities)
- Employee type matching (ULP/FT)
- Active/inactive status
- Existing priority ordering (as tiebreaker)

## Problem 2: HC Import Status
Newly imported HC leads were appearing as "Tag Added" because:
1. The `statuses` table had `tag_added` with `is_default_for_new = true`
2. The old `bulk_import_leads` RPC used to fall back to `is_default_for_new`
   when no status was provided, picking up `tag_added`
3. The current RPC inserts NULL for status, but the column default is 'NEW'

## Fix 2:
1. Rewrite `bulk_import_leads` to set `status = 'RINGING'` when no status
   is provided by the import row (instead of leaving it NULL/default).
2. Set `is_default_for_new = false` on the `tag_added` status so it is
   never used as an automatic default for new/imported leads.
3. Keep `is_default_for_new = true` only on `fresh` and `existing`
   (used by non-HC products that explicitly pass those status codes).

## No data loss
- Existing leads are NOT modified.
- No tables or columns are dropped or renamed.
- No RLS policies changed.
*/

-- ============================================================
-- FIX 1: Rewrite assign_new_lead with round-robin distribution
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_new_lead(p_lead_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_caller RECORD;
  v_city_id uuid;
  v_assigned_count integer;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lead not found');
  END IF;

  -- Resolve city_id from product_cities
  SELECT pc.id INTO v_city_id
  FROM public.product_cities pc
  WHERE pc.product_id = v_lead.product_id AND pc.city_name = v_lead.city
  LIMIT 1;

  -- Round-robin: pick the eligible caller with the FEWEST assigned leads
  -- for this product+city+employee_type. Ties broken by priority, then created_at.
  -- This ensures leads are distributed: A, B, C, A, B, C, ...

  -- Primary: match employee_type + city in caller_queues
  SELECT cq.employee_id, cq.product_id, cq.city_id
  INTO v_caller
  FROM public.caller_queues cq
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS cnt
    FROM public.leads l
    WHERE l.product_id = cq.product_id
      AND l.current_caller_id = cq.employee_id
      AND l.is_active = true
  ) AS assigned ON true
  WHERE cq.product_id = v_lead.product_id
    AND cq.is_active = true
    AND cq.employee_type = v_lead.lead_type
    AND (cq.city_id IS NULL OR cq.city_id = v_city_id)
  ORDER BY assigned.cnt ASC, cq.priority ASC, cq.created_at ASC
  LIMIT 1;

  -- Fallback 1: match employee_type via employee_product_cities
  IF NOT FOUND THEN
    SELECT cq.employee_id, cq.product_id, cq.city_id
    INTO v_caller
    FROM public.caller_queues cq
    INNER JOIN public.employee_product_cities epc
      ON epc.employee_id = cq.employee_id
      AND epc.product_id = cq.product_id
      AND epc.is_active = true
      AND epc.employee_type = v_lead.lead_type
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS cnt
      FROM public.leads l
      WHERE l.product_id = cq.product_id
        AND l.current_caller_id = cq.employee_id
        AND l.is_active = true
    ) AS assigned ON true
    WHERE cq.product_id = v_lead.product_id
      AND cq.is_active = true
    ORDER BY assigned.cnt ASC, cq.priority ASC, cq.created_at ASC
    LIMIT 1;
  END IF;

  -- Fallback 2: any active caller for this product+city (backward compat)
  IF NOT FOUND THEN
    SELECT cq.employee_id, cq.product_id, cq.city_id
    INTO v_caller
    FROM public.caller_queues cq
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS cnt
      FROM public.leads l
      WHERE l.product_id = cq.product_id
        AND l.current_caller_id = cq.employee_id
        AND l.is_active = true
    ) AS assigned ON true
    WHERE cq.product_id = v_lead.product_id
      AND cq.is_active = true
      AND (cq.city_id IS NULL OR cq.city_id = v_city_id)
    ORDER BY assigned.cnt ASC, cq.priority ASC, cq.created_at ASC
    LIMIT 1;
  END IF;

  -- Fallback 3: any active caller for this product (no city filter)
  IF NOT FOUND THEN
    SELECT cq.employee_id, cq.product_id, cq.city_id
    INTO v_caller
    FROM public.caller_queues cq
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS cnt
      FROM public.leads l
      WHERE l.product_id = cq.product_id
        AND l.current_caller_id = cq.employee_id
        AND l.is_active = true
    ) AS assigned ON true
    WHERE cq.product_id = v_lead.product_id
      AND cq.is_active = true
    ORDER BY assigned.cnt ASC, cq.priority ASC, cq.created_at ASC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active callers available');
  END IF;

  UPDATE public.leads
  SET current_caller_id = v_caller.employee_id,
      status = 'RINGING',
      assigned_at = now(),
      is_active = true,
      updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments (lead_id, product_id, previous_caller_id, new_caller_id, previous_status, new_status, assignment_reason, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_caller.employee_id, v_lead.status, 'RINGING', 'AUTO_ASSIGN', 'SYSTEM', auth.uid());

  INSERT INTO public.lead_status_history (lead_id, previous_status, new_status, remarks, actor_type, actor_id, employee_id, product_id)
  VALUES (p_lead_id, v_lead.status, 'RINGING', 'Auto-assigned to caller', 'SYSTEM', auth.uid(), v_caller.employee_id, v_lead.product_id);

  RETURN json_build_object('success', true, 'caller_id', v_caller.employee_id);
END;
$function$;

-- ============================================================
-- FIX 2a: Rewrite bulk_import_leads to default status to RINGING
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

      -- Default status to RINGING when not provided
      if v_status_code is null then
        v_status_code := 'RINGING';
      end if;

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

      -- Resolve status code to UUID
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

      -- Insert the lead
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
-- FIX 2b: Remove is_default_for_new from tag_added status
-- ============================================================
UPDATE public.statuses SET is_default_for_new = false WHERE lower(code) = 'tag_added';
