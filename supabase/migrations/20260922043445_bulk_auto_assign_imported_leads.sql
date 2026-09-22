/*
# Bulk Auto-Assign Imported Leads (All Products)

## Purpose
After a lead import, newly inserted leads have `current_caller_id = NULL` (Unassigned).
This function automatically distributes those unassigned leads equally among active
callers in the product's Caller Queue using round-robin.

## What Changed
- New SECURITY DEFINER function `bulk_auto_assign_imported_leads(p_product_id uuid)`.
- Works for ALL products (Car, Auto, Tempo, Bike, HC) — replaces the HC-only gap.
- Reuses the existing `caller_queues`, `profiles`, `leads`, and `lead_assignments` tables.
- Round-robin distribution: with N active callers and M leads, each caller gets ~M/N leads.
- City-aware: if a lead has a city, callers assigned to that city are preferred; if no
  city-specific caller is available, city-agnostic callers (city_id IS NULL) are used.
- Only callers with `caller_queues.is_active = true` AND `profiles.is_active = true` receive leads.
- Leads already assigned or in admin review are skipped.
- Returns `{ assigned, admin_review }` counts.

## Security
- SECURITY DEFINER, search_path = public.
- Granted to `authenticated` role.
- No RLS changes — uses existing tables and policies.
*/

CREATE OR REPLACE FUNCTION public.bulk_auto_assign_imported_leads(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned int := 0;
  v_review int := 0;
  v_lead RECORD;
  v_city_id uuid;
  v_callers uuid[];
  v_caller_count int;
  v_idx int := 0;
  v_caller_id uuid;
  v_callers_json jsonb;
BEGIN
  -- Collect all active callers for this product, ordered by priority then creation time.
  -- City-specific callers first (ordered by priority), then city-agnostic ones.
  SELECT jsonb_agg(employee_id ORDER BY priority ASC, created_at ASC) INTO v_callers_json
  FROM public.caller_queues cq
  JOIN public.profiles p ON p.id = cq.employee_id
  WHERE cq.product_id = p_product_id
    AND cq.is_active = true
    AND p.is_active = true;

  IF v_callers_json IS NULL OR jsonb_array_length(v_callers_json) = 0 THEN
    -- No active callers: move all unassigned leads to ADMIN_REVIEW
    FOR v_lead IN
      SELECT id, product_id, status FROM public.leads
      WHERE product_id = p_product_id
        AND current_caller_id IS NULL
        AND in_admin_review = false
      ORDER BY created_at ASC
    LOOP
      UPDATE public.leads
        SET status = 'ADMIN_REVIEW', in_admin_review = true, assigned_at = now()
        WHERE id = v_lead.id;

      INSERT INTO public.lead_assignments
        (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
         new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
      VALUES (v_lead.id, p_product_id, NULL, NULL,
        v_lead.status, 'ADMIN_REVIEW', 'AUTO_ASSIGN_IMPORT', 'SYSTEM', NULL, 0,
        'No active caller available at import');

      v_review := v_review + 1;
    END LOOP;

    RETURN jsonb_build_object('assigned', v_assigned, 'admin_review', v_review);
  END IF;

  -- Convert jsonb array to uuid array
  SELECT array_agg(value::text::uuid) INTO v_callers
  FROM jsonb_array_elements(v_callers_json);

  v_caller_count := array_length(v_callers, 1);

  FOR v_lead IN
    SELECT id, city, status, product_id FROM public.leads
    WHERE product_id = p_product_id
      AND current_caller_id IS NULL
      AND in_admin_review = false
    ORDER BY created_at ASC
  LOOP
    -- Resolve city_id from lead's city name
    v_city_id := NULL;
    IF v_lead.city IS NOT NULL THEN
      SELECT id INTO v_city_id
      FROM public.product_cities
      WHERE product_id = p_product_id AND city_name = v_lead.city AND is_active = true
      LIMIT 1;
    END IF;

    -- Try to find a city-specific active caller first
    v_caller_id := NULL;
    IF v_city_id IS NOT NULL THEN
      SELECT cq.employee_id INTO v_caller_id
      FROM public.caller_queues cq
      JOIN public.profiles p ON p.id = cq.employee_id
      WHERE cq.product_id = p_product_id
        AND cq.is_active = true
        AND p.is_active = true
        AND cq.city_id = v_city_id
      ORDER BY cq.priority ASC, cq.created_at ASC
      LIMIT 1;
    END IF;

    -- Fallback: round-robin among all active callers (city-agnostic)
    IF v_caller_id IS NULL THEN
      v_idx := (v_idx % v_caller_count) + 1;
      v_caller_id := v_callers[v_idx];
    END IF;

    -- Assign the lead
    UPDATE public.leads
      SET current_caller_id = v_caller_id,
          assigned_at = now(),
          status = 'NEW',
          in_admin_review = false
      WHERE id = v_lead.id;

    INSERT INTO public.lead_assignments
      (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
       new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (v_lead.id, p_product_id, NULL, v_caller_id,
      v_lead.status, 'NEW', 'AUTO_ASSIGN_IMPORT', 'SYSTEM', NULL, 0,
      'Auto-assignment on import');

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object('assigned', v_assigned, 'admin_review', v_review);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.bulk_auto_assign_imported_leads(uuid) TO authenticated;
