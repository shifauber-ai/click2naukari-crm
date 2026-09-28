/*
# Add employee_type to caller_queues and update target achievement RPC

1. Changes:
- Add `employee_type` (text, default 'ULP') to `caller_queues` — stores ULP or FT per queue entry.
- Update `get_target_achievement` RPC to handle OLA and RAPIDO metrics with city filtering.
- Add unique constraint on caller_queues (product_id, employee_id, city_id, employee_type) to prevent duplicates.
- Add index on caller_queues(employee_type).

2. Notes:
- Existing caller_queues rows default to 'ULP'.
- The RPC now supports: ULP (uber_id_done), FT (status=ID_DONE + lead_type=FT), OLA (ola_id_done), RAPIDO (rapido_id_done), COLLECTION (payment_records.amount).
- All metrics are city-filtered using the target's city_id.
*/

-- Add employee_type to caller_queues
ALTER TABLE public.caller_queues
ADD COLUMN IF NOT EXISTS employee_type text NOT NULL DEFAULT 'ULP';

-- Unique constraint: one employee per product+city+type in the queue
DO $$ BEGIN
  ALTER TABLE public.caller_queues DROP CONSTRAINT IF EXISTS caller_queues_prod_emp_city_type_uk;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.caller_queues
ADD CONSTRAINT caller_queues_prod_emp_city_type_uk
UNIQUE (product_id, employee_id, city_id, employee_type);

-- Index for filtering by employee_type
CREATE INDEX IF NOT EXISTS idx_caller_queues_employee_type ON public.caller_queues(employee_type);

-- Updated RPC with OLA, RAPIDO, and COLLECTION support
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
  v_metric RECORD;
  v_achieved numeric := 0;
  v_remaining numeric;
  v_pct integer;
  v_metric_key text;
  v_value_type text;
BEGIN
  SELECT t.*, m.key, m.value_type
  INTO v_target
  FROM public.employee_targets t
  LEFT JOIN public.target_metrics m ON m.id = t.target_metric_id
  WHERE t.id = p_target_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Target not found');
  END IF;

  v_metric_key := COALESCE(v_target.key, v_target.target_type);
  v_value_type := COALESCE(v_target.value_type, 'COUNT');

  -- Resolve city name from city_id
  IF v_target.city_id IS NOT NULL THEN
    SELECT city_name INTO v_city_name FROM public.product_cities WHERE id = v_target.city_id;
  END IF;

  -- COLLECTION / AMOUNT: sum payment_records.amount
  IF v_value_type = 'AMOUNT' OR v_metric_key = 'COLLECTION' OR v_metric_key = 'OLA_COLLECTION' THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_achieved
    FROM public.payment_records
    WHERE employee_id = v_target.employee_id
      AND product_id = v_target.product_id
      AND payment_status IN ('COMPLETED', 'SUCCESS', 'SUCCESSFUL')
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;
    
  -- ULP: uber_id_done + city + lead_type=ULP
  ELSIF v_metric_key = 'ULP' THEN
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND uber_id_done = true
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND lead_type = 'ULP'
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;

  -- FT: status=ID_DONE + city + lead_type=FT
  ELSIF v_metric_key = 'FT' THEN
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND status = 'ID_DONE'
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND lead_type = 'FT'
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;

  -- OLA: ola_id_done + city
  ELSIF v_metric_key = 'OLA' THEN
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND ola_id_done = true
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;

  -- RAPIDO: rapido_id_done + city
  ELSIF v_metric_key = 'RAPIDO' THEN
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND rapido_id_done = true
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;

  -- TAG_ADDED: status=TAG_ADDED + city
  ELSIF v_metric_key = 'TAG_ADDED' THEN
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND status = 'TAG_ADDED'
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;

  -- TAG_FORM: form_status=TAG_FORM + city
  ELSIF v_metric_key = 'TAG_FORM' THEN
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND form_status = 'TAG_FORM'
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;

  -- Generic fallback: count leads by employee + city
  ELSE
    SELECT count(*) INTO v_achieved
    FROM public.leads
    WHERE product_id = v_target.product_id
      AND current_caller_id = v_target.employee_id
      AND (v_city_name IS NULL OR city ILIKE v_city_name)
      AND created_at >= v_target.start_date::timestamptz
      AND created_at <= (v_target.end_date::date + 1)::timestamptz;
  END IF;

  v_remaining := GREATEST(0, v_target.target_value - v_achieved);
  v_pct := CASE WHEN v_target.target_value > 0 THEN LEAST(100, ROUND((v_achieved / v_target.target_value) * 100)) ELSE 0 END;

  RETURN json_build_object(
    'achieved', v_achieved,
    'remaining', v_remaining,
    'progress_pct', v_pct
  );
END;
$function$;
