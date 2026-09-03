/*
# Ringing 1-Hour Timer + Call History Table + 7-Day Retention

1. Changes RINGING rotation delay from 1 minute to 1 hour.
2. Creates call_history table for Phone Link integration.
3. Adds pg_cron job to delete call records older than 7 days.
4. Adds ringing_started_at column to leads.
*/

-- 1. Add ringing_started_at to leads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'ringing_started_at'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN ringing_started_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2. Change RINGING delay to 1 hour (INTERESTED/CALLBACK stay 48 hours)
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

-- 3. Call History table
CREATE TABLE IF NOT EXISTS public.call_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  direction text NOT NULL DEFAULT 'OUTGOING',
  call_status text NOT NULL DEFAULT 'COMPLETED',
  duration_seconds integer DEFAULT 0,
  outcome text,
  remarks text,
  is_simulated boolean NOT NULL DEFAULT false,
  call_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_history_lead_id ON public.call_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_history_caller_id ON public.call_history(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_history_phone ON public.call_history(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_history_timestamp ON public.call_history(call_timestamp DESC);

ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "callhist_admin_select" ON public.call_history;
CREATE POLICY "callhist_admin_select" ON public.call_history FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "callhist_select_own" ON public.call_history;
CREATE POLICY "callhist_select_own" ON public.call_history FOR SELECT
  TO authenticated USING (auth.uid() = caller_id);

DROP POLICY IF EXISTS "callhist_admin_insert" ON public.call_history;
CREATE POLICY "callhist_admin_insert" ON public.call_history FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "callhist_admin_update" ON public.call_history;
CREATE POLICY "callhist_admin_update" ON public.call_history FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "callhist_admin_delete" ON public.call_history;
CREATE POLICY "callhist_admin_delete" ON public.call_history FOR DELETE
  TO authenticated USING (public.is_admin());

-- 4. 7-day retention cron — use $_$ delimiter for DO block to avoid $$ collision
DO $_$
BEGIN
  PERFORM cron.unschedule('click2naukari-call-history-retention');
EXCEPTION WHEN OTHERS THEN NULL;
END $_$;

DO $_$
BEGIN
  PERFORM cron.schedule(
    'click2naukari-call-history-retention',
    '0 0 * * *',
    $sql$DELETE FROM public.call_history WHERE call_timestamp < now() - interval '7 days'$sql$
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $_$;
