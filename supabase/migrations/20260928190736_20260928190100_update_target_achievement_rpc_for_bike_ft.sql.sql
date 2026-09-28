/*
# Update get_target_achievement RPC for Bike FT

Bike FT is NOT a separate lead or lead_type=FT.
Bike FT = same Bike lead with uber_id_done=true AND bike_ft_status='FT Done'.

For Bike products:
  ULP achievement = count leads where uber_id_done=true, city matches, lead_type != 'FT'
  FT  achievement = count leads where uber_id_done=true AND bike_ft_status='FT Done', city matches

For non-Bike products, the existing logic is unchanged.
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
      -- Bike ULP: leads with uber_id_done=true, city match, lead_type != 'FT'
      SELECT count(*) INTO v_achieved
      FROM public.leads
      WHERE product_id = v_target.product_id
        AND uber_id_done = true
        AND (v_city_name IS NULL OR city ILIKE v_city_name)
        AND (lead_type IS NULL OR lead_type != 'FT')
        AND created_at >= v_target.start_date::timestamptz
        AND created_at <= (v_target.end_date::date + 1)::timestamptz;
    ELSE
      -- Non-Bike ULP: leads with uber_id_done=true, city match, lead_type=ULP
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
      -- Bike FT: same lead with uber_id_done=true AND bike_ft_status='FT Done'
      SELECT count(*) INTO v_achieved
      FROM public.leads
      WHERE product_id = v_target.product_id
        AND uber_id_done = true
        AND bike_ft_status = 'FT Done'
        AND (v_city_name IS NULL OR city ILIKE v_city_name)
        AND created_at >= v_target.start_date::timestamptz
        AND created_at <= (v_target.end_date::date + 1)::timestamptz;
    ELSE
      -- Non-Bike FT: leads with FT workflow ID Done, city match, lead_type=FT
      SELECT count(*) INTO v_achieved
      FROM public.leads
      WHERE product_id = v_target.product_id
        AND (v_city_name IS NULL OR city ILIKE v_city_name)
        AND lead_type = 'FT'
        AND status = 'ID_DONE'
        AND created_at >= v_target.start_date::timestamptz
        AND created_at <= (v_target.end_date::date + 1)::timestamptz;
    END IF;
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
