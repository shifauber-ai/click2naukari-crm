/*
# Add get_target_achievement RPC

Calculates actual completed count for a target based on:
- ULP: Product + City + Uber + ID Done + lead_type = ULP
- FT: Product + City + FT workflow + ID Done + lead_type = FT

Returns: { achieved: number, remaining: number, progress_pct: number }

This replaces the client-side calculateAchievement function for count-based targets,
fixing the core bug where city filtering was missing.
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
BEGIN
  SELECT * INTO v_target FROM public.employee_targets WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Target not found');
  END IF;

  -- Resolve city name from city_id
  IF v_target.city_id IS NOT NULL THEN
    SELECT city_name INTO v_city_name FROM public.product_cities WHERE id = v_target.city_id;
  END IF;

  -- Calculate achieved based on target_type
  IF v_target.target_type = 'ULP' THEN
    -- ULP: leads with uber_id_done=true, matching city, lead_type=ULP, in date range
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND uber_id_done = true
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND lead_type = 'ULP'
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;
  ELSIF v_target.target_type = 'FT' THEN
    -- FT: leads with FT workflow ID Done, matching city, lead_type=FT, in date range
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND lead_type = 'FT'
      AND status = 'ID_DONE'
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
