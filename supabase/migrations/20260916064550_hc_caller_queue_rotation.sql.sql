-- HC Caller Queue: 5-minute ringing rotation, auto-assignment, duplicate protection
-- Reuses existing caller_queues, lead_assignments, scheduled_transitions tables.

-- ============================================================
-- 1. Fix rotate_to_next_caller: handle NULL city_id
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

  -- Resolve city_id (may be NULL for HC leads without a city)
  SELECT id INTO v_city_id
  FROM public.product_cities
  WHERE product_id = v_lead.product_id AND city_name = v_lead.city AND is_active = true
  LIMIT 1;

  -- Get current caller's priority
  SELECT priority INTO v_current_priority
  FROM public.caller_queues
  WHERE product_id = v_lead.product_id
    AND employee_id = v_lead.current_caller_id
    AND (city_id = v_city_id OR (city_id IS NULL AND v_city_id IS NULL))
  LIMIT 1;

  -- Find next active caller with higher priority
  SELECT cq.employee_id INTO v_next_caller_id
  FROM public.caller_queues cq
  JOIN public.profiles p ON p.id = cq.employee_id
  WHERE cq.product_id = v_lead.product_id
    AND cq.is_active = true
    AND p.is_active = true
    AND (cq.city_id = v_city_id OR (cq.city_id IS NULL AND v_city_id IS NULL))
    AND cq.priority > COALESCE(v_current_priority, -1)
  ORDER BY cq.priority ASC, cq.created_at ASC
  LIMIT 1;

  -- If no next caller found, move to ADMIN_REVIEW
  IF v_next_caller_id IS NULL THEN
    UPDATE public.leads
    SET status = 'ADMIN_REVIEW', in_admin_review = true,
        current_caller_id = NULL, rotation_count = rotation_count + 1,
        next_followup_at = NULL, ringing_started_at = NULL
    WHERE id = p_lead_id;

    INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
     new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
     v_lead.status, 'ADMIN_REVIEW', p_reason, p_actor_type, p_actor_id,
     v_lead.rotation_count + 1, 'All active callers attempted; moved to Admin Review');

    INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status, 'ADMIN_REVIEW',
     'Auto: all callers attempted', p_actor_type, p_actor_id);

    RETURN NULL;
  END IF;

  -- Assign to next caller
  UPDATE public.leads
  SET current_caller_id = v_next_caller_id,
      status = 'NEW',
      rotation_count = rotation_count + 1,
      assigned_at = now(),
      last_contact_at = NULL,
      next_followup_at = NULL,
      in_admin_review = false,
      ringing_started_at = NULL
  WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
  (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
   new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_next_caller_id,
   v_lead.status, 'NEW', p_reason, p_actor_type, p_actor_id,
   v_lead.rotation_count + 1, 'Rotation to next caller');

  INSERT INTO public.lead_status_history
  (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, v_next_caller_id, v_lead.status, 'NEW',
   'Auto rotation: ' || p_reason, p_actor_type, p_actor_id);

  RETURN v_next_caller_id;
END;
$$;

-- ============================================================
-- 2. Update update_lead_status: 5-minute delay for HC RINGING
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_lead_status(
  p_lead_id uuid,
  p_new_status text,
  p_remarks text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_is_admin boolean;
  v_is_owner boolean;
  v_transition_type text;
  v_delay interval;
  v_next_action timestamptz;
  v_is_hc boolean;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  v_is_admin := public.is_admin();
  v_is_owner := (auth.uid() = v_lead.current_caller_id);
  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to update this lead';
  END IF;

  -- Cancel any pending transitions for this lead
  PERFORM public.cancel_pending_transitions(p_lead_id);

  -- Record status history
  INSERT INTO public.lead_status_history
  (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status,
  p_new_status, p_remarks, CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid());

  -- Determine if this is an HC product
  v_is_hc := EXISTS (SELECT 1 FROM public.products WHERE id = v_lead.product_id AND code = 'H001');

  v_transition_type := NULL;
  CASE p_new_status
    WHEN 'RINGING' THEN
      v_transition_type := 'RINGING_ROTATION';
      -- HC: 5 minutes; all other products: 1 hour
      v_delay := CASE WHEN v_is_hc THEN interval '5 minutes' ELSE interval '1 hour' END;
    WHEN 'INTERESTED' THEN
      v_transition_type := 'INTERESTED_ROTATION';
      v_delay := interval '24 hours';
    WHEN 'CALLBACK' THEN
      v_transition_type := 'CALLBACK_ROTATION';
      v_delay := interval '24 hours';
    ELSE NULL;
  END CASE;

  IF v_transition_type IS NOT NULL THEN
    v_next_action := now() + v_delay;
    UPDATE public.leads
    SET status = p_new_status, remarks = p_remarks,
        last_contact_at = now(),
        next_followup_at = v_next_action,
        in_admin_review = false,
        ringing_started_at = CASE WHEN p_new_status = 'RINGING' THEN now() ELSE NULL END
    WHERE id = p_lead_id;

    INSERT INTO public.scheduled_transitions
    (lead_id, product_id, current_caller_id, expected_status, next_action_at,
     transition_type, status, attempt_number)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_new_status,
    v_next_action, v_transition_type, 'PENDING', v_lead.rotation_count + 1);
    RETURN;
  END IF;

  -- Non-rotation statuses: update lead, clear ringing
  CASE p_new_status
    WHEN 'ID_DONE' THEN
      UPDATE public.leads SET status = 'ID_DONE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        ringing_started_at = NULL WHERE id = p_lead_id;
      IF v_lead.platform IS NOT NULL THEN
        INSERT INTO public.lead_platform_status (lead_id, platform_id, status, completed_at, completed_by)
        SELECT p_lead_id, p.id, 'DONE', now(), auth.uid()
        FROM public.platforms p WHERE p.name = v_lead.platform
        ON CONFLICT (lead_id, platform_id) DO UPDATE
        SET status = 'DONE', completed_at = now(), completed_by = auth.uid(), updated_at = now();
      END IF;
    WHEN 'ID_BLOCK' THEN
      UPDATE public.leads SET status = 'ID_BLOCK', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        ringing_started_at = NULL WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'ID_BLOCK', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'DOC_ISSUE' THEN
      UPDATE public.leads SET status = 'DOC_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        ringing_started_at = NULL WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'DOCUMENT_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'VEHICLE_ISSUE' THEN
      UPDATE public.leads SET status = 'VEHICLE_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        ringing_started_at = NULL WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'VEHICLE_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'OTHER_ISSUE' THEN
      UPDATE public.leads SET status = 'OTHER_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        ringing_started_at = NULL WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'OTHER_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'OTHER_HERO' THEN
      UPDATE public.leads SET status = 'OTHER_HERO', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        ringing_started_at = NULL WHERE id = p_lead_id;
      INSERT INTO public.other_hero_leads (lead_id, product_id, employee_id, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_remarks)
      ON CONFLICT DO NOTHING;
    ELSE
      UPDATE public.leads SET status = p_new_status, remarks = p_remarks,
        ringing_started_at = NULL WHERE id = p_lead_id;
  END CASE;

  PERFORM public.write_audit_log('STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('from', v_lead.status, 'to', p_new_status, 'remarks', p_remarks));
END;
$$;

-- ============================================================
-- 3. HC auto-assign function with duplicate protection
-- ============================================================
CREATE OR REPLACE FUNCTION public.hc_auto_assign_lead(p_lead_id uuid)
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  -- Duplicate protection: skip if already has an active caller
  IF v_lead.current_caller_id IS NOT NULL AND v_lead.in_admin_review = false THEN
    RETURN v_lead.current_caller_id;
  END IF;

  -- Resolve city_id (may be NULL)
  SELECT id INTO v_city_id
  FROM public.product_cities
  WHERE product_id = v_lead.product_id AND city_name = v_lead.city AND is_active = true
  LIMIT 1;

  -- Find first active HC caller by priority (city-specific or city-agnostic)
  SELECT cq.employee_id INTO v_caller_id
  FROM public.caller_queues cq
  JOIN public.profiles p ON p.id = cq.employee_id
  WHERE cq.product_id = v_lead.product_id
    AND cq.is_active = true
    AND p.is_active = true
    AND (cq.city_id = v_city_id OR (cq.city_id IS NULL AND v_city_id IS NULL))
  ORDER BY cq.priority ASC, cq.created_at ASC
  LIMIT 1;

  -- If no caller with matching city, try city-agnostic callers
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
    -- No active callers: move to ADMIN_REVIEW
    UPDATE public.leads
    SET status = 'ADMIN_REVIEW', in_admin_review = true,
        current_caller_id = NULL, assigned_at = now()
    WHERE id = p_lead_id;

    INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
     new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
     v_lead.status, 'ADMIN_REVIEW', 'HC_AUTO_ASSIGN', 'SYSTEM', NULL, 0,
     'No active HC caller available');
    RETURN NULL;
  END IF;

  -- Assign to caller
  UPDATE public.leads
  SET current_caller_id = v_caller_id,
      assigned_at = now(),
      status = 'NEW',
      in_admin_review = false
  WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
  (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
   new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, NULL, v_caller_id,
   v_lead.status, 'NEW', 'HC_AUTO_ASSIGN', 'SYSTEM', NULL, 0,
   'HC auto-assignment on import');

  RETURN v_caller_id;
END;
$$;

-- ============================================================
-- 4. Bulk HC auto-assign for import batches
-- ============================================================
CREATE OR REPLACE FUNCTION public.hc_bulk_auto_assign(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned int := 0;
  v_review int := 0;
  v_lead RECORD;
  v_caller_id uuid;
BEGIN
  FOR v_lead IN
    SELECT id FROM public.leads
    WHERE product_id = p_product_id
      AND current_caller_id IS NULL
      AND in_admin_review = false
    ORDER BY created_at ASC
  LOOP
    v_caller_id := public.hc_auto_assign_lead(v_lead.id);
    IF v_caller_id IS NOT NULL THEN
      v_assigned := v_assigned + 1;
    ELSE
      v_review := v_review + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('assigned', v_assigned, 'admin_review', v_review);
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.hc_auto_assign_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hc_bulk_auto_assign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_to_next_caller(uuid, text, text, uuid) TO authenticated;
