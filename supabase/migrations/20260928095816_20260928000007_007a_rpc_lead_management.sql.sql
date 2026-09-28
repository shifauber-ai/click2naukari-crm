/*
# 007a — RPC Functions: Lead Management (Part 1)

Drops existing function versions that have incompatible signatures, then recreates with correct return types.

## Functions created:
1. update_lead_status(p_lead_id, p_new_status, p_remarks, p_callback_date, p_callback_time) → json
2. update_lead_platform_status(p_lead_id, p_platform_name, p_status, p_remarks, p_callback_date, p_callback_time) → json
3. assign_new_lead(p_lead_id) → json
4. admin_reassign_lead(p_lead_id, p_new_caller_id, p_new_status, p_remarks) → json
5. admin_edit_lead(p_lead_id, p_name, p_phone, p_product_id, p_status, p_current_caller_id, p_remarks) → json
6. admin_permanent_delete_lead(p_lead_id) → json
7. admin_bulk_permanent_delete_leads(p_lead_ids) → json
8. admin_bulk_assign_leads(p_lead_ids, p_new_caller_id) → json
9. admin_bulk_equally_assign_leads(p_lead_ids, p_caller_ids) → json
*/

-- Drop existing versions that may have different signatures
DROP FUNCTION IF EXISTS public.update_lead_status(uuid, text, text, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_lead_status(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_lead_platform_status(uuid, text, text, text, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_lead_platform_status(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.assign_new_lead(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_reassign_lead(uuid, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_reassign_lead(uuid, uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_edit_lead(uuid, text, text, uuid, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_permanent_delete_lead(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_bulk_permanent_delete_leads(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.admin_bulk_assign_leads(uuid[], uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_bulk_equally_assign_leads(uuid[], uuid[]) CASCADE;

-- === update_lead_status ===
CREATE OR REPLACE FUNCTION public.update_lead_status(
  p_lead_id uuid,
  p_new_status text,
  p_remarks text DEFAULT '',
  p_callback_date date DEFAULT NULL,
  p_callback_time text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_callback_at timestamptz;
  v_caller_id uuid;
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
  ELSIF p_callback_date IS NOT NULL THEN
    v_callback_at := p_callback_date::timestamptz;
  END IF;

  v_caller_id := COALESCE(v_lead.current_caller_id, auth.uid());

  UPDATE public.leads
  SET status = p_new_status,
      remarks = COALESCE(NULLIF(p_remarks, ''), remarks),
      next_followup_at = v_callback_at,
      last_contact_at = now(),
      updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.lead_status_history (lead_id, previous_status, new_status, remarks, actor_type, actor_id, employee_id, product_id)
  VALUES (p_lead_id, v_lead.status, p_new_status, COALESCE(p_remarks, ''), 'USER', auth.uid(), v_caller_id, v_lead.product_id);

  RETURN json_build_object('success', true);
END;
$$;

-- === update_lead_platform_status ===
CREATE OR REPLACE FUNCTION public.update_lead_platform_status(
  p_lead_id uuid,
  p_platform_name text,
  p_status text,
  p_remarks text DEFAULT NULL,
  p_callback_date date DEFAULT NULL,
  p_callback_time text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_callback_at timestamptz;
  v_existing RECORD;
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
      next_followup_at = COALESCE(v_callback_at, next_followup_at),
      last_contact_at = now(),
      updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.lead_status_history (lead_id, previous_status, new_status, remarks, actor_type, actor_id, employee_id, product_id)
  VALUES (p_lead_id, v_lead.status, p_status, COALESCE(p_remarks, ''), 'USER', auth.uid(), v_lead.current_caller_id, v_lead.product_id);

  RETURN json_build_object('success', true);
END;
$$;

-- === assign_new_lead ===
CREATE OR REPLACE FUNCTION public.assign_new_lead(p_lead_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_caller RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lead not found');
  END IF;

  -- Find next caller via priority ordering from caller_queues
  SELECT cq.employee_id, cq.product_id, cq.city_id
  INTO v_caller
  FROM public.caller_queues cq
  WHERE cq.product_id = v_lead.product_id
    AND cq.is_active = true
    AND (cq.city_id IS NULL OR cq.city_id = (
      SELECT pc.id FROM public.product_cities pc
      WHERE pc.product_id = v_lead.product_id AND pc.city_name = v_lead.city
      LIMIT 1
    ))
  ORDER BY cq.priority ASC, cq.created_at ASC
  LIMIT 1;

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
$$;

-- === admin_reassign_lead ===
CREATE OR REPLACE FUNCTION public.admin_reassign_lead(
  p_lead_id uuid,
  p_new_caller_id uuid,
  p_new_status text,
  p_remarks text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lead not found');
  END IF;

  IF NOT (public.is_admin() OR public.is_manager_of_product(v_lead.product_id)) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.leads
  SET current_caller_id = p_new_caller_id,
      status = p_new_status,
      remarks = COALESCE(NULLIF(p_remarks, ''), remarks),
      assigned_at = now(),
      updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments (lead_id, product_id, previous_caller_id, new_caller_id, previous_status, new_status, assignment_reason, actor_type, actor_id, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_new_caller_id, v_lead.status, p_new_status, 'MANUAL_REASSIGN', 'USER', auth.uid(), p_remarks);

  INSERT INTO public.lead_status_history (lead_id, previous_status, new_status, remarks, actor_type, actor_id, employee_id, product_id)
  VALUES (p_lead_id, v_lead.status, p_new_status, p_remarks, 'USER', auth.uid(), p_new_caller_id, v_lead.product_id);

  RETURN json_build_object('success', true);
END;
$$;

-- === admin_edit_lead ===
CREATE OR REPLACE FUNCTION public.admin_edit_lead(
  p_lead_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_current_caller_id uuid DEFAULT NULL,
  p_remarks text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lead not found');
  END IF;

  IF NOT (public.is_admin() OR public.is_manager_of_product(v_lead.product_id)) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.leads
  SET name = COALESCE(p_name, name),
      phone = COALESCE(p_phone, phone),
      product_id = COALESCE(p_product_id, product_id),
      status = COALESCE(p_status, status),
      current_caller_id = COALESCE(p_current_caller_id, current_caller_id),
      remarks = COALESCE(p_remarks, remarks),
      updated_at = now()
  WHERE id = p_lead_id;

  IF p_status IS NOT NULL AND p_status != v_lead.status THEN
    INSERT INTO public.lead_status_history (lead_id, previous_status, new_status, remarks, actor_type, actor_id, employee_id, product_id)
    VALUES (p_lead_id, v_lead.status, p_status, COALESCE(p_remarks, ''), 'USER', auth.uid(), COALESCE(p_current_caller_id, v_lead.current_caller_id), v_lead.product_id);
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- === admin_permanent_delete_lead ===
CREATE OR REPLACE FUNCTION public.admin_permanent_delete_lead(p_lead_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Lead not found');
  END IF;

  IF NOT (public.is_admin() OR public.is_manager_of_product(v_lead.product_id)) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  DELETE FROM public.lead_platform_status WHERE lead_id = p_lead_id;
  DELETE FROM public.lead_status_history WHERE lead_id = p_lead_id;
  DELETE FROM public.lead_assignments WHERE lead_id = p_lead_id;
  DELETE FROM public.scheduled_transitions WHERE lead_id = p_lead_id;
  DELETE FROM public.call_history WHERE lead_id = p_lead_id;
  DELETE FROM public.issues WHERE lead_id = p_lead_id;
  DELETE FROM public.other_hero_leads WHERE lead_id = p_lead_id;
  DELETE FROM public.payment_records WHERE lead_id = p_lead_id;
  DELETE FROM public.import_records WHERE lead_id = p_lead_id;
  DELETE FROM public.leads WHERE id = p_lead_id;

  RETURN json_build_object('success', true);
END;
$$;

-- === admin_bulk_permanent_delete_leads ===
CREATE OR REPLACE FUNCTION public.admin_bulk_permanent_delete_leads(p_lead_ids uuid[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_count integer := 0;
BEGIN
  FOREACH v_lead_id IN ARRAY p_lead_ids LOOP
    PERFORM public.admin_permanent_delete_lead(v_lead_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN json_build_object('success', true, 'deleted_count', v_count);
END;
$$;

-- === admin_bulk_assign_leads ===
CREATE OR REPLACE FUNCTION public.admin_bulk_assign_leads(
  p_lead_ids uuid[],
  p_new_caller_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_count integer := 0;
BEGIN
  FOREACH v_lead_id IN ARRAY p_lead_ids LOOP
    PERFORM public.admin_reassign_lead(v_lead_id, p_new_caller_id, 'RINGING', 'Bulk assigned');
    v_count := v_count + 1;
  END LOOP;
  RETURN json_build_object('success', true, 'assigned_count', v_count);
END;
$$;

-- === admin_bulk_equally_assign_leads ===
CREATE OR REPLACE FUNCTION public.admin_bulk_equally_assign_leads(
  p_lead_ids uuid[],
  p_caller_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_caller_id uuid;
  v_idx integer := 0;
  v_count integer := 0;
  v_num_callers integer;
BEGIN
  v_num_callers := array_length(p_caller_ids, 1);
  IF v_num_callers IS NULL OR v_num_callers = 0 THEN
    RETURN json_build_object('success', false, 'error', 'No callers provided');
  END IF;

  FOREACH v_lead_id IN ARRAY p_lead_ids LOOP
    v_idx := v_count % v_num_callers;
    v_caller_id := p_caller_ids[v_idx + 1];
    PERFORM public.admin_reassign_lead(v_lead_id, v_caller_id, 'RINGING', 'Bulk equally assigned');
    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'assigned_count', v_count);
END;
$$;
