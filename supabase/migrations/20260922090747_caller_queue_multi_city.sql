/*
# Caller Queue: Multi-City Assignment

## Problem
The unique constraint `caller_queues_product_id_employee_id_key` is
`UNIQUE (product_id, employee_id)`, which prevents the same caller from
being added to multiple city queues for the same product.

## Fix 1: Unique constraint
Drop the old constraint and create a new one that includes city_id:
`UNIQUE (product_id, employee_id, COALESCE(city_id, '00000000-0000-0000-0000-000000000000'))`
This allows one row per (product, employee, city) combination, including
one product-wide (city_id IS NULL) row.

## Fix 2: City-aware lead assignment
Update `assign_new_lead` to prefer city-specific callers:
- If the lead has a city, resolve its city_id from product_cities.
- First try callers assigned to that city_id.
- Fall back to city-agnostic callers (city_id IS NULL).
- If neither exists, fall back to any active caller for the product.

## Fix 3: City-aware rotation
Update `rotate_to_next_caller` similarly:
- Find current caller's priority within the lead's city pool.
- Rotate to the next caller in the same city pool.
- If no next caller in the city pool, try city-agnostic callers.
- If none, move to admin review.

## Data safety
No data is lost. No tables or columns are dropped. Only constraint and
function definitions change.
*/

-- ============================================================
-- Fix 1: Unique constraint
-- ============================================================
ALTER TABLE public.caller_queues
  DROP CONSTRAINT IF EXISTS caller_queues_product_id_employee_id_key;

CREATE UNIQUE INDEX caller_queues_product_employee_city_uniq
  ON public.caller_queues (product_id, employee_id, COALESCE(city_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================================
-- Fix 2: City-aware assign_new_lead
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_new_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_caller_id uuid;
  v_city_id uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- Resolve city_id from lead's city name
  v_city_id := NULL;
  IF v_lead.city IS NOT NULL THEN
    SELECT id INTO v_city_id
    FROM public.product_cities
    WHERE product_id = v_lead.product_id AND city_name = v_lead.city AND is_active = true
    LIMIT 1;
  END IF;

  -- 1. Try city-specific active caller
  IF v_city_id IS NOT NULL THEN
    SELECT cq.employee_id INTO v_caller_id
      FROM public.caller_queues cq
      JOIN public.profiles p ON p.id = cq.employee_id
      WHERE cq.product_id = v_lead.product_id
        AND cq.is_active = true
        AND p.is_active = true
        AND cq.city_id = v_city_id
      ORDER BY cq.priority ASC, cq.created_at ASC
      LIMIT 1;
  END IF;

  -- 2. Fall back to city-agnostic caller (city_id IS NULL)
  IF v_caller_id IS NULL THEN
    SELECT cq.employee_id INTO v_caller_id
      FROM public.caller_queues cq
      JOIN public.profiles p ON p.id = cq.employee_id
      WHERE cq.product_id = v_lead.product_id
        AND cq.is_active = true
        AND p.is_active = true
        AND cq.city_id IS NULL
      ORDER BY cq.priority ASC, cq.created_at ASC
      LIMIT 1;
  END IF;

  -- 3. Fall back to any active caller for the product
  IF v_caller_id IS NULL THEN
    SELECT cq.employee_id INTO v_caller_id
      FROM public.caller_queues cq
      JOIN public.profiles p ON p.id = cq.employee_id
      WHERE cq.product_id = v_lead.product_id
        AND cq.is_active = true
        AND p.is_active = true
      ORDER BY cq.priority ASC, cq.created_at ASC
      LIMIT 1;
  END IF;

  IF v_caller_id IS NULL THEN
    -- No active caller: send to admin review.
    UPDATE public.leads
      SET status = 'ADMIN_REVIEW', in_admin_review = true,
          current_caller_id = NULL, assigned_at = now()
      WHERE id = p_lead_id;
    INSERT INTO public.lead_assignments
      (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
       new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
      v_lead.status, 'ADMIN_REVIEW', 'INITIAL_ASSIGNMENT', 'SYSTEM', NULL, 0,
      'No active caller in queue');
    RETURN NULL;
  END IF;

  UPDATE public.leads
    SET current_caller_id = v_caller_id, assigned_at = now(), status = 'NEW'
    WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
     new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_caller_id,
    v_lead.status, 'NEW', 'INITIAL_ASSIGNMENT', 'SYSTEM', auth.uid(), 0, 'Initial assignment');

  RETURN v_caller_id;
END;
$$;

-- ============================================================
-- Fix 3: City-aware rotate_to_next_caller
-- ============================================================
CREATE OR REPLACE FUNCTION public.rotate_to_next_caller(
  p_lead_id uuid,
  p_reason text,
  p_actor_type text DEFAULT 'SYSTEM',
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_current_priority int;
  v_next_caller_id uuid;
  v_city_id uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Resolve city_id from lead's city name
  v_city_id := NULL;
  IF v_lead.city IS NOT NULL THEN
    SELECT id INTO v_city_id
    FROM public.product_cities
    WHERE product_id = v_lead.product_id AND city_name = v_lead.city AND is_active = true
    LIMIT 1;
  END IF;

  -- Current caller's priority in this product's queue (any city).
  SELECT priority INTO v_current_priority
    FROM public.caller_queues
    WHERE product_id = v_lead.product_id AND employee_id = v_lead.current_caller_id
    ORDER BY created_at ASC
    LIMIT 1;

  -- 1. Try next caller in the same city
  IF v_city_id IS NOT NULL THEN
    SELECT cq.employee_id INTO v_next_caller_id
      FROM public.caller_queues cq
      JOIN public.profiles p ON p.id = cq.employee_id
      WHERE cq.product_id = v_lead.product_id
        AND cq.is_active = true
        AND p.is_active = true
        AND cq.city_id = v_city_id
        AND cq.priority > COALESCE(v_current_priority, -1)
      ORDER BY cq.priority ASC, cq.created_at ASC
      LIMIT 1;
  END IF;

  -- 2. Fall back to city-agnostic caller
  IF v_next_caller_id IS NULL THEN
    SELECT cq.employee_id INTO v_next_caller_id
      FROM public.caller_queues cq
      JOIN public.profiles p ON p.id = cq.employee_id
      WHERE cq.product_id = v_lead.product_id
        AND cq.is_active = true
        AND p.is_active = true
        AND cq.city_id IS NULL
        AND cq.priority > COALESCE(v_current_priority, -1)
      ORDER BY cq.priority ASC, cq.created_at ASC
      LIMIT 1;
  END IF;

  -- 3. Fall back to any next caller for the product
  IF v_next_caller_id IS NULL THEN
    SELECT cq.employee_id INTO v_next_caller_id
      FROM public.caller_queues cq
      JOIN public.profiles p ON p.id = cq.employee_id
      WHERE cq.product_id = v_lead.product_id
        AND cq.is_active = true
        AND p.is_active = true
        AND cq.priority > COALESCE(v_current_priority, -1)
      ORDER BY cq.priority ASC, cq.created_at ASC
      LIMIT 1;
  END IF;

  IF v_next_caller_id IS NULL THEN
    -- No next active caller -> ADMIN REVIEW.
    UPDATE public.leads
      SET status = 'ADMIN_REVIEW', in_admin_review = true,
          current_caller_id = NULL, rotation_count = rotation_count + 1,
          next_followup_at = NULL
      WHERE id = p_lead_id;
    INSERT INTO public.lead_assignments
      (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
       new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
      v_lead.status, 'ADMIN_REVIEW', p_reason, p_actor_type, p_actor_id,
      v_lead.rotation_count + 1, 'No next active caller; moved to Admin Review');
    INSERT INTO public.lead_status_history
      (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status, 'ADMIN_REVIEW',
      'Auto: no next caller', p_actor_type, p_actor_id);
    RETURN NULL;
  END IF;

  UPDATE public.leads
    SET current_caller_id = v_next_caller_id,
        status = 'NEW',
        rotation_count = rotation_count + 1,
        assigned_at = now(),
        last_contact_at = NULL,
        next_followup_at = NULL,
        in_admin_review = false
    WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
     new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_next_caller_id,
    v_lead.status, 'NEW', p_reason, p_actor_type, p_actor_id,
    v_lead.rotation_count + 1, 'Rotation');
  INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, v_next_caller_id, v_lead.status, 'NEW',
    'Auto rotation: ' || p_reason, p_actor_type, p_actor_id);

  RETURN v_next_caller_id;
END;
$$;
