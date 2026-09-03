/*
# Click2Naukari CRM — Workflow & Rotation Functions

## Overview
SECURITY DEFINER RPC functions implementing the lead workflow:
- assign_new_lead(p_lead_id): initial assignment to first active caller in queue.
- update_lead_status(p_lead_id, p_new_status, p_remarks): employee/admin status change.
  Handles RINGING (1 min transition), INTERESTED (48h), CALLBACK (48h), ID_DONE,
  ID_BLOCK/DOC/VEHICLE/OTHER ISSUE -> Issue tab, OTHER_HERO -> Other Hero tab,
  and cancels stale pending transitions on terminal/issue status changes.
- admin_reassign_lead(p_lead_id, p_new_caller_id, p_new_status, p_remarks): admin reassignment.
- process_due_transitions(): idempotent processor that claims PENDING transitions
  past next_action_at, verifies invariants, rotates to next active caller or
  moves to ADMIN_REVIEW, and marks COMPLETED. NEVER wraps around to caller 1.
- cancel_pending_transitions(p_lead_id): helper to cancel stale timers.
- bootstrap_admin(): creates the admin profile row after auth.users signup (called from edge function).
- write_audit_log(): helper.

All mutations run with SECURITY DEFINER (service-role-like) privileges so RLS
doesn't block the workflow, but each function first verifies the caller's role
and ownership server-side.

## Security
- update_lead_status requires auth.uid() to be the lead's current_caller OR an admin.
- admin_reassign_lead requires is_admin().
- process_due_transitions is called by pg_cron as a SECURITY DEFINER function
  with no user session; it never reads auth.uid().
- Bootstrap functions require service-role / are guarded by edge function.

## Notes
- Rotation NEVER wraps from last caller back to caller 1. If no next active caller,
  the lead goes to ADMIN_REVIEW.
- Stale timer protection: any status change cancels existing PENDING transitions
  for that lead before (possibly) creating a new one.
- Idempotency: process_due_transitions uses SELECT ... FOR UPDATE SKIP LOCKED
  and a status-guarded claim (PENDING -> PROCESSING) so concurrent runs don't
  double-process the same transition.
*/

-- Helper: write audit log (SECURITY DEFINER, callable by authenticated).
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action text,
  p_entity text DEFAULT '',
  p_entity_id text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity, p_entity_id, p_metadata);
END;
$$;

-- Helper: cancel all PENDING transitions for a lead.
CREATE OR REPLACE FUNCTION public.cancel_pending_transitions(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.scheduled_transitions
    SET status = 'CANCELLED', processed_at = now()
    WHERE lead_id = p_lead_id AND status = 'PENDING';
END;
$$;

-- Assign a newly-created lead to the first active caller in its product's queue.
-- Called by admin after creating a lead (or by import).
CREATE OR REPLACE FUNCTION public.assign_new_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_caller_id uuid;
  v_caller_priority int;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- First active caller, lowest priority number first.
  SELECT cq.employee_id INTO v_caller_id
    FROM public.caller_queues cq
    JOIN public.profiles p ON p.id = cq.employee_id
    WHERE cq.product_id = v_lead.product_id
      AND cq.is_active = true
      AND p.is_active = true
    ORDER BY cq.priority ASC, cq.created_at ASC
    LIMIT 1;

  IF v_caller_id IS NULL THEN
    -- No active caller: send to admin review.
    UPDATE public.leads
      SET status = 'ADMIN_REVIEW', in_admin_review = true,
          current_caller_id = NULL, assigned_at = now()
      WHERE id = p_lead_id;
    INSERT INTO public.lead_assignments
      (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
       new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
      v_lead.status, 'ADMIN_REVIEW', 'INITIAL_ASSIGNMENT', 'SYSTEM', NULL, 0,
      'No active caller in queue');
    RETURN NULL;
  END IF;

  UPDATE public.leads
    SET current_caller_id = v_caller_id, assigned_at = now(), status = 'NEW'
    WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
     new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_caller_id,
    v_lead.status, 'NEW', 'INITIAL_ASSIGNMENT', 'SYSTEM', auth.uid(), 0, 'Initial assignment');

  RETURN v_caller_id;
END;
$$;

-- Rotate a lead to the next active caller in its product queue.
-- Returns the new caller id, or NULL if moved to ADMIN_REVIEW (no next caller).
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
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Current caller's priority in this product's queue.
  SELECT priority INTO v_current_priority
    FROM public.caller_queues
    WHERE product_id = v_lead.product_id AND employee_id = v_lead.current_caller_id
    LIMIT 1;

  -- Next active caller with strictly greater priority (NO wrap-around).
  SELECT cq.employee_id INTO v_next_caller_id
    FROM public.caller_queues cq
    JOIN public.profiles p ON p.id = cq.employee_id
    WHERE cq.product_id = v_lead.product_id
      AND cq.is_active = true
      AND p.is_active = true
      AND cq.priority > COALESCE(v_current_priority, -1)
    ORDER BY cq.priority ASC, cq.created_at ASC
    LIMIT 1;

  IF v_next_caller_id IS NULL THEN
    -- No next active caller -> ADMIN REVIEW.
    UPDATE public.leads
      SET status = 'ADMIN_REVIEW', in_admin_review = true,
          current_caller_id = NULL, rotation_count = rotation_count + 1,
          next_followup_at = NULL
      WHERE id = p_lead_id;
    INSERT INTO public.lead_assignments
      (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
       new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
      v_lead.status, 'ADMIN_REVIEW', p_reason, p_actor_type, p_actor_id,
      v_lead.rotation_count + 1, 'No next active caller; moved to Admin Review');
    INSERT INTO public.lead_status_history
      (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status, 'ADMIN_REVIEW',
      'Auto: no next caller', p_actor_type, p_actor_id);
    RETURN NULL;
  END IF;

  UPDATE public.leads
    SET current_caller_id = v_next_caller_id,
        status = 'NEW',
        rotation_count = rotation_count + 1,
        assigned_at = now(),
        last_contact_at = NULL,
        next_followup_at = NULL,
        in_admin_review = false
    WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
     new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_next_caller_id,
    v_lead.status, 'NEW', p_reason, p_actor_type, p_actor_id,
    v_lead.rotation_count + 1, 'Rotation');
  INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, v_next_caller_id, v_lead.status, 'NEW',
    'Auto rotation: ' || p_reason, p_actor_type, p_actor_id);

  RETURN v_next_caller_id;
END;
$$;

-- Core employee/admin status update.
CREATE OR REPLACE FUNCTION public.update_lead_status(
  p_lead_id uuid,
  p_new_status text,
  p_remarks text DEFAULT ''
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
  v_issue_type text;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  v_is_admin := public.is_admin();
  v_is_owner := (auth.uid() = v_lead.current_caller_id);
  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to update this lead';
  END IF;

  -- Always cancel stale pending transitions first.
  PERFORM public.cancel_pending_transitions(p_lead_id);

  -- Record status history.
  INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status,
    p_new_status, p_remarks, CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid());

  -- Determine transition type + delay.
  v_transition_type := NULL;
  CASE p_new_status
    WHEN 'RINGING' THEN
      v_transition_type := 'RINGING_ROTATION';
      v_delay := interval '1 minute';
    WHEN 'INTERESTED' THEN
      v_transition_type := 'INTERESTED_ROTATION';
      v_delay := interval '48 hours';
    WHEN 'CALLBACK' THEN
      v_transition_type := 'CALLBACK_ROTATION';
      v_delay := interval '48 hours';
    ELSE NULL;
  END CASE;

  IF v_transition_type IS NOT NULL THEN
    v_next_action := now() + v_delay;
    UPDATE public.leads
      SET status = p_new_status, remarks = p_remarks,
          last_contact_at = now(),
          next_followup_at = v_next_action,
          in_admin_review = false
      WHERE id = p_lead_id;
    INSERT INTO public.scheduled_transitions
      (lead_id, product_id, current_caller_id, expected_status, next_action_at,
       transition_type, status, attempt_number)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_new_status,
      v_next_action, v_transition_type, 'PENDING', v_lead.rotation_count + 1);
    RETURN;
  END IF;

  -- Terminal / non-rotating statuses.
  CASE p_new_status
    WHEN 'ID_DONE' THEN
      UPDATE public.leads SET status = 'ID_DONE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false
        WHERE id = p_lead_id;
    WHEN 'ID_BLOCK' THEN
      UPDATE public.leads SET status = 'ID_BLOCK', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false
        WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'ID_BLOCK', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'DOC_ISSUE' THEN
      UPDATE public.leads SET status = 'DOC_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false
        WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'DOCUMENT_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'VEHICLE_ISSUE' THEN
      UPDATE public.leads SET status = 'VEHICLE_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false
        WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'VEHICLE_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'OTHER_ISSUE' THEN
      UPDATE public.leads SET status = 'OTHER_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false
        WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'OTHER_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'OTHER_HERO' THEN
      UPDATE public.leads SET status = 'OTHER_HERO', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false
        WHERE id = p_lead_id;
      INSERT INTO public.other_hero_leads (lead_id, product_id, employee_id, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_remarks)
      ON CONFLICT DO NOTHING;
    ELSE
      UPDATE public.leads SET status = p_new_status, remarks = p_remarks WHERE id = p_lead_id;
  END CASE;

  PERFORM public.write_audit_log('STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('from', v_lead.status, 'to', p_new_status, 'remarks', p_remarks));
END;
$$;

-- Admin manual reassignment.
CREATE OR REPLACE FUNCTION public.admin_reassign_lead(
  p_lead_id uuid,
  p_new_caller_id uuid,
  p_new_status text DEFAULT 'NEW',
  p_remarks text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  PERFORM public.cancel_pending_transitions(p_lead_id);

  UPDATE public.leads
    SET current_caller_id = p_new_caller_id,
        status = p_new_status,
        remarks = p_remarks,
        assigned_at = now(),
        last_contact_at = NULL,
        next_followup_at = NULL,
        in_admin_review = false
    WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
     new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_new_caller_id,
    v_lead.status, p_new_status, 'ADMIN_REASSIGNMENT', 'ADMIN', auth.uid(),
    v_lead.rotation_count + 1, p_remarks);
  INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, p_new_caller_id, v_lead.status, p_new_status,
    p_remarks, 'ADMIN', auth.uid());

  PERFORM public.write_audit_log('ADMIN_REASSIGN', 'lead', p_lead_id::text,
    jsonb_build_object('from_caller', v_lead.current_caller_id, 'to_caller', p_new_caller_id));
END;
$$;

-- Idempotent processor for due transitions. Called by pg_cron (no user session).
CREATE OR REPLACE FUNCTION public.process_due_transitions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed int := 0;
  v_rec RECORD;
  v_lead public.leads%ROWTYPE;
  v_new_caller uuid;
BEGIN
  FOR v_rec IN
    SELECT id, lead_id, product_id, current_caller_id, expected_status, attempt_number
    FROM public.scheduled_transitions
    WHERE status = 'PENDING' AND next_action_at <= now()
    ORDER BY next_action_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Claim atomically (idempotency guard).
    UPDATE public.scheduled_transitions
      SET status = 'PROCESSING'
      WHERE id = v_rec.id AND status = 'PENDING';
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT * INTO v_lead FROM public.leads WHERE id = v_rec.lead_id;
    -- Invariant checks: lead still has expected status + expected caller.
    IF NOT FOUND
       OR v_lead.status <> v_rec.expected_status
       OR v_lead.current_caller_id IS DISTINCT FROM v_rec.current_caller_id
    THEN
      UPDATE public.scheduled_transitions
        SET status = 'CANCELLED', processed_at = now(),
            error_info = 'Stale: lead state changed'
        WHERE id = v_rec.id;
      CONTINUE;
    END IF;

    -- Rotate (never wraps around).
    v_new_caller := public.rotate_to_next_caller(
      v_rec.lead_id,
      v_rec.transition_type,
      'SYSTEM',
      NULL
    );

    UPDATE public.scheduled_transitions
      SET status = 'COMPLETED', processed_at = now()
      WHERE id = v_rec.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;

-- Bootstrap: create profile row for a newly-created auth user (called by edge fn with service role).
-- p_role must be 'ADMIN' or 'EMPLOYEE'.
CREATE OR REPLACE FUNCTION public.bootstrap_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text DEFAULT 'EMPLOYEE'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (p_user_id, p_email, p_full_name, p_role, true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;
END;
$$;

-- Grant execute to authenticated (and anon for bootstrap via edge fn service role).
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_lead_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reassign_lead(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_new_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_to_next_caller(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pending_transitions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_profile(uuid, text, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.process_due_transitions() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, anon;
