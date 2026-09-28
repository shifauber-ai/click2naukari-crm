/*
# Update assign_new_lead to use caller_queues.employee_type

The caller queue now stores employee_type (ULP/FT).
This RPC matches the lead's lead_type with the queue entry's employee_type.
*/

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

  -- Find next caller matching employee_type in caller_queues
  SELECT cq.employee_id, cq.product_id, cq.city_id
  INTO v_caller
  FROM public.caller_queues cq
  WHERE cq.product_id = v_lead.product_id
    AND cq.is_active = true
    AND cq.employee_type = v_lead.lead_type
    AND (cq.city_id IS NULL OR cq.city_id = v_city_id)
  ORDER BY cq.priority ASC, cq.created_at ASC
  LIMIT 1;

  -- Fallback: match employee_type via employee_product_cities
  IF NOT FOUND THEN
    SELECT cq.employee_id, cq.product_id, cq.city_id
    INTO v_caller
    FROM public.caller_queues cq
    INNER JOIN public.employee_product_cities epc
      ON epc.employee_id = cq.employee_id
      AND epc.product_id = cq.product_id
      AND epc.is_active = true
      AND epc.employee_type = v_lead.lead_type
    WHERE cq.product_id = v_lead.product_id
      AND cq.is_active = true
    ORDER BY cq.priority ASC, cq.created_at ASC
    LIMIT 1;
  END IF;

  -- Fallback: any active caller for this product+city (backward compat)
  IF NOT FOUND THEN
    SELECT cq.employee_id, cq.product_id, cq.city_id
    INTO v_caller
    FROM public.caller_queues cq
    WHERE cq.product_id = v_lead.product_id
      AND cq.is_active = true
      AND (cq.city_id IS NULL OR cq.city_id = v_city_id)
    ORDER BY cq.priority ASC, cq.created_at ASC
    LIMIT 1;
  END IF;

  -- Final fallback: any active caller for this product
  IF NOT FOUND THEN
    SELECT cq.employee_id, cq.product_id, cq.city_id
    INTO v_caller
    FROM public.caller_queues cq
    WHERE cq.product_id = v_lead.product_id AND cq.is_active = true
    ORDER BY cq.priority ASC, cq.created_at ASC
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
