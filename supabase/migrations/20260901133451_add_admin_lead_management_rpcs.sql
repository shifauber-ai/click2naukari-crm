/*
# Admin Lead Management RPCs

## Summary
Adds three SECURITY DEFINER functions to support admin lead management:
1. admin_edit_lead — allows admin to safely update lead fields (name, phone, product_id, status, current_caller_id, remarks) with audit logging. Does NOT reset rotation_count, follow-up timers, assignment history, or status history.
2. admin_soft_delete_lead — sets is_active = false (soft delete). Does NOT permanently delete the lead row or cascade-delete related records. Writes audit log. Only admin can call.
3. admin_bulk_assign_leads — batch-assigns multiple leads to a single employee. Validates that the employee is an ACTIVE caller for each lead's product. Returns a summary of assigned/skipped counts. Only admin can call.

## Security
- All three functions are SECURITY DEFINER with search_path = public.
- All three check public.is_admin() first and raise 'Admin only' if not admin.
- No RLS policy changes needed — leads_admin_update and leads_admin_delete already exist.
- No new tables created.
- No existing data modified.

## Important Notes
1. admin_edit_lead only updates the fields passed (NULL means "don't change this field"). It preserves rotation_count, assigned_at, last_contact_at, next_followup_at, in_admin_review unless explicitly changed.
2. admin_soft_delete_lead sets is_active = false. Deleted leads won't appear in normal queries that filter is_active = true. The lead row and all related records (assignments, history, transitions, issues) are preserved.
3. admin_bulk_assign_leads checks caller_queues for each lead's product. If the employee is not an active caller for that product, the lead is skipped (not assigned). Returns JSON with assigned_count, skipped_count, and skipped_lead_ids array.
4. All functions write audit logs via public.write_audit_log().
*/

-- ============ admin_edit_lead ============
CREATE OR REPLACE FUNCTION public.admin_edit_lead(
  p_lead_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_current_caller_id uuid DEFAULT NULL,
  p_remarks text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  -- Build update dynamically, tracking what changed for audit.
  IF p_name IS NOT NULL AND p_name <> v_lead.name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(v_lead.name, p_name));
    UPDATE public.leads SET name = p_name WHERE id = p_lead_id;
  END IF;

  IF p_phone IS NOT NULL AND p_phone <> v_lead.phone THEN
    v_changes := v_changes || jsonb_build_object('phone', jsonb_build_array(v_lead.phone, p_phone));
    UPDATE public.leads SET phone = p_phone WHERE id = p_lead_id;
  END IF;

  IF p_product_id IS NOT NULL AND p_product_id <> v_lead.product_id THEN
    v_changes := v_changes || jsonb_build_object('product_id', jsonb_build_array(v_lead.product_id, p_product_id));
    UPDATE public.leads SET product_id = p_product_id WHERE id = p_lead_id;
  END IF;

  IF p_status IS NOT NULL AND p_status <> v_lead.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_array(v_lead.status, p_status));
    UPDATE public.leads SET status = p_status WHERE id = p_lead_id;
    INSERT INTO public.lead_status_history
      (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status, p_status,
      'Admin edit', 'ADMIN', auth.uid());
  END IF;

  IF p_current_caller_id IS DISTINCT FROM v_lead.current_caller_id THEN
    v_changes := v_changes || jsonb_build_object('current_caller_id',
      jsonb_build_array(v_lead.current_caller_id, p_current_caller_id));
    UPDATE public.leads SET current_caller_id = p_current_caller_id WHERE id = p_lead_id;
  END IF;

  IF p_remarks IS NOT NULL AND p_remarks <> v_lead.remarks THEN
    v_changes := v_changes || jsonb_build_object('remarks', jsonb_build_array(v_lead.remarks, p_remarks));
    UPDATE public.leads SET remarks = p_remarks WHERE id = p_lead_id;
  END IF;

  PERFORM public.write_audit_log('LEAD_EDIT', 'lead', p_lead_id::text, v_changes);
END;
$$;

-- ============ admin_soft_delete_lead ============
CREATE OR REPLACE FUNCTION public.admin_soft_delete_lead(
  p_lead_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.leads
    SET is_active = false,
        in_admin_review = false,
        next_followup_at = NULL
    WHERE id = p_lead_id AND is_active = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found or already deleted'; END IF;

  PERFORM public.cancel_pending_transitions(p_lead_id);

  PERFORM public.write_audit_log('LEAD_DELETE', 'lead', p_lead_id::text,
    jsonb_build_object('soft_delete', true));
END;
$$;

-- ============ admin_bulk_assign_leads ============
CREATE OR REPLACE FUNCTION public.admin_bulk_assign_leads(
  p_lead_ids uuid[],
  p_new_caller_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_lead public.leads%ROWTYPE;
  v_assigned int := 0;
  v_skipped int := 0;
  v_skipped_ids uuid[] := ARRAY[]::uuid[];
  v_is_valid_caller boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- Verify the target employee is active.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_new_caller_id AND is_active = true) THEN
    RAISE EXCEPTION 'Selected employee is not active';
  END IF;

  FOREACH v_lead_id IN ARRAY p_lead_ids
  LOOP
    SELECT * INTO v_lead FROM public.leads WHERE id = v_lead_id AND is_active = true;
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
      CONTINUE;
    END IF;

    -- Check if employee is an active caller for this lead's product.
    SELECT EXISTS(
      SELECT 1 FROM public.caller_queues cq
      WHERE cq.product_id = v_lead.product_id
        AND cq.employee_id = p_new_caller_id
        AND cq.is_active = true
    ) INTO v_is_valid_caller;

    IF NOT v_is_valid_caller THEN
      v_skipped := v_skipped + 1;
      v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
      CONTINUE;
    END IF;

    -- Cancel pending transitions for this lead.
    PERFORM public.cancel_pending_transitions(v_lead_id);

    -- Update the lead.
    UPDATE public.leads
      SET current_caller_id = p_new_caller_id,
          assigned_at = now(),
          in_admin_review = false
      WHERE id = v_lead_id;

    -- Record assignment.
    INSERT INTO public.lead_assignments
      (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
       new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (v_lead_id, v_lead.product_id, v_lead.current_caller_id, p_new_caller_id,
      v_lead.status, v_lead.status, 'MANUAL_ASSIGNMENT', 'ADMIN', auth.uid(),
      v_lead.rotation_count, 'Bulk assignment by admin');

    v_assigned := v_assigned + 1;
  END LOOP;

  PERFORM public.write_audit_log('BULK_ASSIGN', 'leads', '',
    jsonb_build_object('assigned', v_assigned, 'skipped', v_skipped,
      'target_caller', p_new_caller_id, 'lead_count', array_length(p_lead_ids, 1)));

  RETURN jsonb_build_object(
    'assigned_count', v_assigned,
    'skipped_count', v_skipped,
    'skipped_lead_ids', v_skipped_ids
  );
END;
$$;

-- Grant execute to authenticated only (admin-only functions).
GRANT EXECUTE ON FUNCTION public.admin_edit_lead(uuid, text, text, uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_assign_leads(uuid[], uuid) TO authenticated;
