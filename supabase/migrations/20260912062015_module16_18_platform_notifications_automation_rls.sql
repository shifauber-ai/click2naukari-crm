/*
# Module 16/18 — Platform Progress, Notifications, 24hr Automation, Employee RLS, Delete RPCs, Indexes

## Summary
1. Create `lead_platform_status` table for tracking per-platform completion (Uber DONE, Ola DONE, etc.)
2. Create `notifications` table for follow-up reminders and assignment alerts
3. Change Interested/Callback timeout from 48h to 24h in `update_lead_status`
4. Remove NULL city_id fallback from `assign_new_lead` and `rotate_to_next_caller` — strict product+city only
5. Add Employee RLS policy on leads using `employee_product_cities` (product + city scope)
6. Add `delete_lead` and `bulk_delete_leads` SECURITY DEFINER RPCs for permanent deletion
7. Add `delete_employee` SECURITY DEFINER RPC for permanent user deletion
8. Add performance indexes

## New Tables
- `lead_platform_status`: Per-lead per-platform completion tracking. Unique on (lead_id, platform_id).
- `notifications`: User-specific notifications for follow-ups, assignments, etc.

## Modified Functions
- `update_lead_status`: 48h → 24h for INTERESTED and CALLBACK; also marks platform DONE on ID_DONE
- `assign_new_lead`: No NULL city fallback — strict product+city matching only
- `rotate_to_next_caller`: No NULL city fallback — strict product+city matching only

## RLS Changes
- New Employee SELECT/UPDATE policies on leads using employee_product_cities join
- Notifications: user-scoped CRUD policies
- lead_platform_status: Admin/Manager/Employee scoped policies

## Security
- `delete_lead` and `bulk_delete_leads`: Admin/Manager only, cascades dependent records
- `delete_employee`: Admin only, cleans up references then deletes profile
*/

-- 1. Create lead_platform_status table
CREATE TABLE IF NOT EXISTS public.lead_platform_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_lps_lead ON public.lead_platform_status(lead_id);
CREATE INDEX IF NOT EXISTS idx_lps_platform ON public.lead_platform_status(platform_id);

ALTER TABLE public.lead_platform_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lps_admin_select" ON public.lead_platform_status;
CREATE POLICY "lps_admin_select" ON public.lead_platform_status
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "lps_admin_insert" ON public.lead_platform_status;
CREATE POLICY "lps_admin_insert" ON public.lead_platform_status
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lps_admin_update" ON public.lead_platform_status;
CREATE POLICY "lps_admin_update" ON public.lead_platform_status
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lps_admin_delete" ON public.lead_platform_status;
CREATE POLICY "lps_admin_delete" ON public.lead_platform_status
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "lps_manager_select" ON public.lead_platform_status;
CREATE POLICY "lps_manager_select" ON public.lead_platform_status
  FOR SELECT TO authenticated
  USING (public.is_manager() AND EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_platform_status.lead_id
    AND l.product_id = ANY(public.assigned_product_ids())
  ));

DROP POLICY IF EXISTS "lps_employee_select" ON public.lead_platform_status;
CREATE POLICY "lps_employee_select" ON public.lead_platform_status
  FOR SELECT TO authenticated
  USING (auth.uid() = (SELECT l.current_caller_id FROM public.leads l WHERE l.id = lead_platform_status.lead_id));

DROP POLICY IF EXISTS "lps_employee_update" ON public.lead_platform_status;
CREATE POLICY "lps_employee_update" ON public.lead_platform_status
  FOR UPDATE TO authenticated
  USING (auth.uid() = (SELECT l.current_caller_id FROM public.leads l WHERE l.id = lead_platform_status.lead_id))
  WITH CHECK (auth.uid() = (SELECT l.current_caller_id FROM public.leads l WHERE l.id = lead_platform_status.lead_id));

DROP POLICY IF EXISTS "lps_employee_insert" ON public.lead_platform_status;
CREATE POLICY "lps_employee_insert" ON public.lead_platform_status
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT l.current_caller_id FROM public.leads l WHERE l.id = lead_platform_status.lead_id));

-- 2. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'FOLLOW_UP',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_insert_own" ON public.notifications;
CREATE POLICY "notif_insert_own" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_delete_own" ON public.notifications;
CREATE POLICY "notif_delete_own" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. Update update_lead_status: 48h → 24h for INTERESTED and CALLBACK, plus platform DONE on ID_DONE
CREATE OR REPLACE FUNCTION public.update_lead_status(p_lead_id uuid, p_new_status text, p_remarks text DEFAULT ''::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_is_admin boolean;
  v_is_owner boolean;
  v_transition_type text;
  v_delay interval;
  v_next_action timestamptz;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  v_is_admin := public.is_admin();
  v_is_owner := (auth.uid() = v_lead.current_caller_id);
  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to update this lead';
  END IF;

  PERFORM public.cancel_pending_transitions(p_lead_id);

  INSERT INTO public.lead_status_history
  (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status,
  p_new_status, p_remarks, CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid());

  v_transition_type := NULL;
  CASE p_new_status
  WHEN 'RINGING' THEN
    v_transition_type := 'RINGING_ROTATION';
    v_delay := interval '1 hour';
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
$function$;

-- 4. Update assign_new_lead — strict product+city, no NULL fallback
CREATE OR REPLACE FUNCTION public.assign_new_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_caller_id uuid;
  v_city_id uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  SELECT id INTO v_city_id FROM public.product_cities
  WHERE product_id = v_lead.product_id AND city_name = v_lead.city AND is_active = true
  LIMIT 1;

  SELECT cq.employee_id INTO v_caller_id
  FROM public.caller_queues cq
  JOIN public.profiles p ON p.id = cq.employee_id
  WHERE cq.product_id = v_lead.product_id
  AND cq.is_active = true
  AND p.is_active = true
  AND cq.city_id = v_city_id
  ORDER BY cq.priority ASC, cq.created_at ASC
  LIMIT 1;

  IF v_caller_id IS NULL THEN
    UPDATE public.leads
    SET status = 'ADMIN_REVIEW', in_admin_review = true,
    current_caller_id = NULL, assigned_at = now()
    WHERE id = p_lead_id;
    INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
    new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
    v_lead.status, 'ADMIN_REVIEW', 'INITIAL_ASSIGNMENT', 'SYSTEM', NULL, 0,
    'No active caller in product+city queue');
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
$function$;

-- 5. Update rotate_to_next_caller — strict product+city, no NULL fallback
CREATE OR REPLACE FUNCTION public.rotate_to_next_caller(p_lead_id uuid, p_reason text, p_actor_type text DEFAULT 'SYSTEM', p_actor_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_current_priority int;
  v_next_caller_id uuid;
  v_city_id uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_city_id FROM public.product_cities
  WHERE product_id = v_lead.product_id AND city_name = v_lead.city AND is_active = true
  LIMIT 1;

  SELECT priority INTO v_current_priority
  FROM public.caller_queues
  WHERE product_id = v_lead.product_id AND employee_id = v_lead.current_caller_id
  AND city_id = v_city_id
  LIMIT 1;

  SELECT cq.employee_id INTO v_next_caller_id
  FROM public.caller_queues cq
  JOIN public.profiles p ON p.id = cq.employee_id
  WHERE cq.product_id = v_lead.product_id
  AND cq.is_active = true
  AND p.is_active = true
  AND cq.city_id = v_city_id
  AND cq.priority > COALESCE(v_current_priority, -1)
  ORDER BY cq.priority ASC, cq.created_at ASC
  LIMIT 1;

  IF v_next_caller_id IS NULL THEN
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
    v_lead.rotation_count + 1, 'No next active caller in product+city; moved to Admin Review');
    INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status, 'ADMIN_REVIEW',
    'Auto: no next caller in city', p_actor_type, p_actor_id);
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
$function$;

-- 6. Add Employee RLS on leads using employee_product_cities
DROP POLICY IF EXISTS "leads_employee_city_select" ON public.leads;
CREATE POLICY "leads_employee_city_select" ON public.leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_product_cities epc
      WHERE epc.employee_id = auth.uid()
      AND epc.product_id = leads.product_id
      AND epc.is_active = true
      AND epc.city_id = (
        SELECT pc.id FROM public.product_cities pc
        WHERE pc.product_id = leads.product_id AND pc.city_name = leads.city AND pc.is_active = true
        LIMIT 1
      )
    )
  );

DROP POLICY IF EXISTS "leads_employee_city_update" ON public.leads;
CREATE POLICY "leads_employee_city_update" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_product_cities epc
      WHERE epc.employee_id = auth.uid()
      AND epc.product_id = leads.product_id
      AND epc.is_active = true
      AND epc.city_id = (
        SELECT pc.id FROM public.product_cities pc
        WHERE pc.product_id = leads.product_id AND pc.city_name = leads.city AND pc.is_active = true
        LIMIT 1
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employee_product_cities epc
      WHERE epc.employee_id = auth.uid()
      AND epc.product_id = leads.product_id
      AND epc.is_active = true
      AND epc.city_id = (
        SELECT pc.id FROM public.product_cities pc
        WHERE pc.product_id = leads.product_id AND pc.city_name = leads.city AND pc.is_active = true
        LIMIT 1
      )
    )
  );

-- 7. Create delete_lead RPC
CREATE OR REPLACE FUNCTION public.delete_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_is_manager boolean;
  v_lead_product_id uuid;
BEGIN
  v_is_admin := public.is_admin();
  v_is_manager := public.is_manager();
  IF NOT (v_is_admin OR v_is_manager) THEN
    RAISE EXCEPTION 'Not authorized to delete leads';
  END IF;

  SELECT product_id INTO v_lead_product_id FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_is_manager AND NOT (v_lead_product_id = ANY(public.assigned_product_ids())) THEN
    RAISE EXCEPTION 'Not authorized to delete leads outside your product scope';
  END IF;

  DELETE FROM public.lead_platform_status WHERE lead_id = p_lead_id;
  DELETE FROM public.lead_assignments WHERE lead_id = p_lead_id;
  DELETE FROM public.lead_status_history WHERE lead_id = p_lead_id;
  DELETE FROM public.scheduled_transitions WHERE lead_id = p_lead_id;
  DELETE FROM public.issues WHERE lead_id = p_lead_id;
  DELETE FROM public.other_hero_leads WHERE lead_id = p_lead_id;
  DELETE FROM public.payment_records WHERE lead_id = p_lead_id;
  DELETE FROM public.call_history WHERE lead_id = p_lead_id;
  DELETE FROM public.notifications WHERE lead_id = p_lead_id;
  DELETE FROM public.leads WHERE id = p_lead_id;

  PERFORM public.write_audit_log('LEAD_DELETE', 'lead', p_lead_id::text, jsonb_build_object('product_id', v_lead_product_id));
END;
$function$;

-- 8. Create bulk_delete_leads RPC
CREATE OR REPLACE FUNCTION public.bulk_delete_leads(p_lead_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_id uuid;
  v_is_admin boolean;
  v_is_manager boolean;
  v_product_id uuid;
BEGIN
  v_is_admin := public.is_admin();
  v_is_manager := public.is_manager();
  IF NOT (v_is_admin OR v_is_manager) THEN
    RAISE EXCEPTION 'Not authorized to delete leads';
  END IF;

  FOREACH v_id IN ARRAY p_lead_ids LOOP
    SELECT product_id INTO v_product_id FROM public.leads WHERE id = v_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_is_manager AND NOT (v_product_id = ANY(public.assigned_product_ids())) THEN CONTINUE; END IF;

    DELETE FROM public.lead_platform_status WHERE lead_id = v_id;
    DELETE FROM public.lead_assignments WHERE lead_id = v_id;
    DELETE FROM public.lead_status_history WHERE lead_id = v_id;
    DELETE FROM public.scheduled_transitions WHERE lead_id = v_id;
    DELETE FROM public.issues WHERE lead_id = v_id;
    DELETE FROM public.other_hero_leads WHERE lead_id = v_id;
    DELETE FROM public.payment_records WHERE lead_id = v_id;
    DELETE FROM public.call_history WHERE lead_id = v_id;
    DELETE FROM public.notifications WHERE lead_id = v_id;
    DELETE FROM public.leads WHERE id = v_id;
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.write_audit_log('BULK_LEAD_DELETE', 'lead', array_to_string(p_lead_ids, ','), jsonb_build_object('count', v_count));
  RETURN v_count;
END;
$function$;

-- 9. Create delete_employee RPC (profile + references; auth user deleted via edge function)
CREATE OR REPLACE FUNCTION public.delete_employee(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_role text;
BEGIN
  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admin can delete users';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_role = 'ADMIN' THEN RAISE EXCEPTION 'Cannot delete admin users'; END IF;

  DELETE FROM public.employee_product_cities WHERE employee_id = p_user_id;
  DELETE FROM public.caller_queues WHERE employee_id = p_user_id;
  DELETE FROM public.manager_product_assignments WHERE manager_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  UPDATE public.leads SET current_caller_id = NULL WHERE current_caller_id = p_user_id;
  UPDATE public.lead_assignments SET actor_id = NULL WHERE actor_id = p_user_id;
  UPDATE public.lead_status_history SET actor_id = NULL WHERE actor_id = p_user_id;
  UPDATE public.payment_records SET collected_by = NULL WHERE collected_by = p_user_id;
  UPDATE public.lead_platform_status SET completed_by = NULL WHERE completed_by = p_user_id;
  DELETE FROM public.issues WHERE employee_id = p_user_id;
  DELETE FROM public.other_hero_leads WHERE employee_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  PERFORM public.write_audit_log('EMPLOYEE_DELETE', 'profile', p_user_id::text, jsonb_build_object('role', v_role));
END;
$function$;

-- 10. Performance indexes
CREATE INDEX IF NOT EXISTS idx_leads_product_city_status ON public.leads(product_id, city, status);
CREATE INDEX IF NOT EXISTS idx_leads_product_city ON public.leads(product_id, city);
CREATE INDEX IF NOT EXISTS idx_leads_caller_status ON public.leads(current_caller_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON public.leads(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_lead ON public.payment_records(lead_id);
CREATE INDEX IF NOT EXISTS idx_payment_product_status ON public.payment_records(product_id, payment_status, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_collected_by ON public.payment_records(collected_by);
CREATE INDEX IF NOT EXISTS idx_call_history_lead ON public.call_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_history_caller ON public.call_history(caller_id, call_timestamp DESC);
