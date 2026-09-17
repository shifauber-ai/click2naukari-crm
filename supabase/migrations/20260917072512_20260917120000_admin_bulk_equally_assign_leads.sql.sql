-- ============ admin_bulk_equally_assign_leads ============
-- Equally distributes selected leads among selected active callers.
-- Reuses the same assignment logic as admin_bulk_assign_leads (cancel transitions,
-- update lead, record assignment, audit log). Validates each caller is an active
-- caller for the lead's product. Skips leads where the chosen caller is not eligible.
-- Does not create duplicate assignments — only assigns leads that are currently
-- active and not already assigned to the same caller.

CREATE OR REPLACE FUNCTION public.admin_bulk_equally_assign_leads(
  p_lead_ids uuid[],
  p_caller_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_ids uuid[] := p_lead_ids;
  v_lead_id uuid;
  v_lead public.leads%ROWTYPE;
  v_caller_id uuid;
  v_caller_idx int := 0;
  v_assigned int := 0;
  v_skipped int := 0;
  v_skipped_ids uuid[] := ARRAY[]::uuid[];
  v_is_valid_caller boolean;
  v_caller_count int;
  v_lead_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_caller_count := array_length(p_caller_ids, 1);
  v_lead_count := array_length(v_lead_ids, 1);

  IF v_caller_count IS NULL OR v_caller_count = 0 THEN
    RAISE EXCEPTION 'No callers selected';
  END IF;
  IF v_lead_count IS NULL OR v_lead_count = 0 THEN
    RAISE EXCEPTION 'No leads selected';
  END IF;

  -- Verify all callers are active.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = ANY(p_caller_ids) AND is_active = true
    HAVING count(*) = v_caller_count
  ) THEN
    RAISE EXCEPTION 'One or more selected employees are not active';
  END IF;

  FOREACH v_lead_id IN ARRAY v_lead_ids
  LOOP
    SELECT * INTO v_lead FROM public.leads WHERE id = v_lead_id AND is_active = true;
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
      CONTINUE;
    END IF;

    -- Round-robin: pick the next caller in rotation
    v_caller_idx := (v_caller_idx % v_caller_count) + 1;
    v_caller_id := p_caller_ids[v_caller_idx];

    -- Check if this caller is an active caller for this lead's product.
    SELECT EXISTS(
      SELECT 1 FROM public.caller_queues cq
      WHERE cq.product_id = v_lead.product_id
        AND cq.employee_id = v_caller_id
        AND cq.is_active = true
    ) INTO v_is_valid_caller;

    IF NOT v_is_valid_caller THEN
      v_skipped := v_skipped + 1;
      v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
      CONTINUE;
    END IF;

    -- Skip if already assigned to the same caller (no duplicate assignment).
    IF v_lead.current_caller_id = v_caller_id THEN
      v_skipped := v_skipped + 1;
      v_skipped_ids := array_append(v_skipped_ids, v_lead_id);
      CONTINUE;
    END IF;

    -- Cancel pending transitions for this lead.
    PERFORM public.cancel_pending_transitions(v_lead_id);

    -- Update the lead.
    UPDATE public.leads
      SET current_caller_id = v_caller_id,
          assigned_at = now(),
          in_admin_review = false
      WHERE id = v_lead_id;

    -- Record assignment.
    INSERT INTO public.lead_assignments
      (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
       new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (v_lead_id, v_lead.product_id, v_lead.current_caller_id, v_caller_id,
      v_lead.status, v_lead.status, 'MANUAL_ASSIGNMENT', 'ADMIN', auth.uid(),
      v_lead.rotation_count, 'Equal bulk assignment by admin');

    v_assigned := v_assigned + 1;
  END LOOP;

  PERFORM public.write_audit_log('BULK_ASSIGN', 'leads', '',
    jsonb_build_object('assigned', v_assigned, 'skipped', v_skipped,
      'mode', 'equal', 'caller_count', v_caller_count, 'lead_count', v_lead_count));

  RETURN jsonb_build_object(
    'assigned_count', v_assigned,
    'skipped_count', v_skipped,
    'skipped_lead_ids', v_skipped_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_equally_assign_leads(uuid[], uuid[]) TO authenticated;
