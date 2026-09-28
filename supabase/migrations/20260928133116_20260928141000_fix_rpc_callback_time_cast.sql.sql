-- Fix: cast p_callback_time text to time type for leads + history columns
CREATE OR REPLACE FUNCTION public.update_lead_status(
  p_lead_id uuid,
  p_new_status text,
  p_remarks text DEFAULT '',
  p_callback_date date DEFAULT NULL,
  p_callback_time text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_callback_at timestamptz;
  v_caller_id uuid;
  v_cb_time time;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lead not found');
  END IF;

  IF NOT (public.is_admin() OR public.is_manager_of_product(v_lead.product_id) OR v_lead.current_caller_id = auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_callback_date IS NOT NULL AND p_callback_time IS NOT NULL THEN
    v_callback_at := (p_callback_date::text || ' ' || p_callback_time)::timestamptz;
    v_cb_time := p_callback_time::time;
  ELSIF p_callback_date IS NOT NULL THEN
    v_callback_at := p_callback_date::timestamptz;
  END IF;

  v_caller_id := COALESCE(v_lead.current_caller_id, auth.uid());

  UPDATE public.leads
  SET status = p_new_status,
      remarks = COALESCE(NULLIF(p_remarks, ''), remarks),
      callback_date = CASE WHEN p_new_status IN ('CALLBACK', 'INTERESTED') THEN p_callback_date ELSE NULL END,
      callback_time = CASE WHEN p_new_status IN ('CALLBACK', 'INTERESTED') THEN v_cb_time ELSE NULL END,
      next_followup_at = CASE WHEN p_new_status IN ('CALLBACK', 'INTERESTED') THEN v_callback_at ELSE NULL END,
      last_contact_at = now(),
      updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.lead_status_history (lead_id, previous_status, new_status, remarks, actor_type, actor_id, employee_id, product_id, callback_date, callback_time)
  VALUES (p_lead_id, v_lead.status, p_new_status, COALESCE(p_remarks, ''), 'USER', auth.uid(), v_caller_id, v_lead.product_id,
    CASE WHEN p_new_status IN ('CALLBACK', 'INTERESTED') THEN p_callback_date ELSE NULL END,
    CASE WHEN p_new_status IN ('CALLBACK', 'INTERESTED') THEN v_cb_time ELSE NULL END
  );

  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_lead_platform_status(
  p_lead_id uuid,
  p_platform_name text,
  p_status text,
  p_remarks text DEFAULT NULL,
  p_callback_date date DEFAULT NULL,
  p_callback_time text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_callback_at timestamptz;
  v_existing RECORD;
  v_cb_time time;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lead not found');
  END IF;

  IF NOT (public.is_admin() OR public.is_manager_of_product(v_lead.product_id) OR v_lead.current_caller_id = auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_callback_date IS NOT NULL AND p_callback_time IS NOT NULL THEN
    v_callback_at := (p_callback_date::text || ' ' || p_callback_time)::timestamptz;
    v_cb_time := p_callback_time::time;
  ELSIF p_callback_date IS NOT NULL THEN
    v_callback_at := p_callback_date::timestamptz;
  END IF;

  SELECT * INTO v_existing FROM public.lead_platform_status WHERE lead_id = p_lead_id AND platform = p_platform_name;
  IF FOUND THEN
    UPDATE public.lead_platform_status
    SET status = p_status, remarks = COALESCE(p_remarks, remarks), completed_by = auth.uid()
    WHERE lead_id = p_lead_id AND platform = p_platform_name;
  ELSE
    INSERT INTO public.lead_platform_status (lead_id, platform, status, completed_by, remarks)
    VALUES (p_lead_id, p_platform_name, p_status, auth.uid(), COALESCE(p_remarks, ''));
  END IF;

  UPDATE public.leads
  SET platform = p_platform_name,
      status = p_status,
      remarks = COALESCE(NULLIF(p_remarks, ''), remarks),
      callback_date = CASE WHEN p_status IN ('CALLBACK', 'INTERESTED') THEN p_callback_date ELSE NULL END,
      callback_time = CASE WHEN p_status IN ('CALLBACK', 'INTERESTED') THEN v_cb_time ELSE NULL END,
      next_followup_at = CASE WHEN p_status IN ('CALLBACK', 'INTERESTED') THEN v_callback_at ELSE NULL END,
      last_contact_at = now(),
      updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.lead_status_history (lead_id, previous_status, new_status, remarks, actor_type, actor_id, employee_id, product_id, callback_date, callback_time)
  VALUES (p_lead_id, v_lead.status, p_status, COALESCE(p_remarks, ''), 'USER', auth.uid(), v_lead.current_caller_id, v_lead.product_id,
    CASE WHEN p_status IN ('CALLBACK', 'INTERESTED') THEN p_callback_date ELSE NULL END,
    CASE WHEN p_status IN ('CALLBACK', 'INTERESTED') THEN v_cb_time ELSE NULL END
  );

  RETURN json_build_object('success', true);
END;
$function$;
