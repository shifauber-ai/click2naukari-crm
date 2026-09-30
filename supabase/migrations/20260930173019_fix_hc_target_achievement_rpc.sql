/*
# Fix HC Target Achievement Calculation

## Problem
The `get_target_achievement` RPC's ELSE branch (which handles TAG_ADDED and TAG_FORM
target types) was counting ALL leads assigned to the employee — not just leads with
actual `status='TAG_ADDED'` or `form_status='TAG_FORM'`. This caused imported/assigned
leads to be counted as "achieved", showing 95 achieved when only 5 were actually Tag Added.

## Fix
Add explicit branches for TAG_ADDED and TAG_FORM target types:
- TAG_ADDED: count leads where status = 'TAG_ADDED' (actual action)
- TAG_FORM: count leads where form_status = 'TAG_FORM' (actual form completion)
- Both filtered by employee_id, product_id, city, and date range

The generic ELSE branch is retained for other metric types but no longer
handles TAG_ADDED or TAG_FORM.

## No Data Loss
No tables dropped, no columns changed, no data deleted.
Only the RPC function definition is updated.
*/

CREATE OR REPLACE FUNCTION public.get_target_achievement(
  p_target_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target RECORD;
  v_city_name text;
  v_achieved integer := 0;
  v_remaining integer;
  v_pct integer;
  v_is_bike boolean := false;
BEGIN
  SELECT * INTO v_target FROM public.employee_targets WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Target not found');
  END IF;

  -- Resolve city name from city_id
  IF v_target.city_id IS NOT NULL THEN
    SELECT city_name INTO v_city_name FROM public.product_cities WHERE id = v_target.city_id;
  END IF;

  -- Check if this product is a Bike product
  SELECT EXISTS(
    SELECT 1 FROM public.products
    WHERE id = v_target.product_id
      AND (UPPER(code) IN ('BIKE', 'MAINB001', 'B001', 'B002')
           OR LOWER(name) LIKE 'bike%')
  ) INTO v_is_bike;

  -- Calculate achieved based on target_type
  IF v_target.target_type = 'ULP' THEN
    IF v_is_bike THEN
      SELECT count(*) INTO v_achieved
      FROM public.leads
      WHERE product_id = v_target.product_id
        AND uber_id_done = true
        AND (v_city_name IS NULL OR city ILIKE v_city_name)
        AND (lead_type IS NULL OR lead_type != 'FT')
        AND created_at >= v_target.start_date::timestamptz
        AND created_at <= (v_target.end_date::date + 1)::timestamptz;
    ELSE
      SELECT count(*) INTO v_achieved
      FROM public.leads
      WHERE product_id = v_target.product_id
        AND uber_id_done = true
        AND (v_city_name IS NULL OR city ILIKE v_city_name)
        AND lead_type = 'ULP'
        AND created_at >= v_target.start_date::timestamptz
        AND created_at <= (v_target.end_date::date + 1)::timestamptz;
    END IF;
  ELSIF v_target.target_type = 'FT' THEN
    IF v_is_bike THEN
      SELECT count(*) INTO v_achieved
      FROM public.leads
      WHERE product_id = v_target.product_id
        AND uber_id_done = true
        AND bike_ft_status = 'FT Done'
        AND (v_city_name IS NULL OR city ILIKE v_city_name)
        AND created_at >= v_target.start_date::timestamptz
        AND created_at <= (v_target.end_date::date + 1)::timestamptz;
    ELSE
      SELECT count(*) INTO v_achieved
      FROM public.leads
      WHERE product_id = v_target.product_id
        AND (v_city_name IS NULL OR city ILIKE v_city_name)
        AND lead_type = 'FT'
        AND status = 'ID_DONE'
        AND created_at >= v_target.start_date::timestamptz
        AND created_at <= (v_target.end_date::date + 1)::timestamptz;
    END IF;
  ELSIF v_target.target_type = 'TAG_ADDED' THEN
    -- HC: count only leads actually marked as TAG_ADDED (not imported/assigned leads)
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND current_caller_id = v_target.employee_id
      AND status = 'TAG_ADDED'
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;
  ELSIF v_target.target_type = 'TAG_FORM' THEN
    -- HC: count only leads where Tag Form was actually completed (form_status = 'TAG_FORM')
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND current_caller_id = v_target.employee_id
      AND form_status = 'TAG_FORM'
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;
  ELSE
    -- Generic count: count leads by current_caller_id matching the target
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND current_caller_id = v_target.employee_id
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;
  END IF;

  v_remaining := GREATEST(0, v_target.target_value - v_achieved);
  v_pct := CASE WHEN v_target.target_value > 0 THEN LEAST(100, ROUND((v_achieved::numeric / v_target.target_value) * 100)) ELSE 0 END;

  RETURN json_build_object(
    'achieved', v_achieved,
    'remaining', v_remaining,
    'progress_pct', v_pct
  );
END;
$function$;
