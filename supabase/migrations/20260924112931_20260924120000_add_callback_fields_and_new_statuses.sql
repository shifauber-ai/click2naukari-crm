/*
# Add Callback Fields and New Lead Statuses

## Overview
Adds support for "Call Back" with date/time, "Interested" with remarks,
and two new statuses "Out of City" and "Not Eligible" to the lead
status-update workflow. Also extends both status-update RPCs to accept
callback date/time parameters and stores them on both the lead and
the status history record.

## Changes

### 1. New columns on `leads`
- `callback_date` (date, nullable) — the date the employee/admin wants to call back
- `callback_time` (time, nullable) — the time of day for the callback

### 2. New columns on `lead_status_history`
- `callback_date` (date, nullable) — callback date captured at the moment of the status change
- `callback_time` (time, nullable) — callback time captured at the moment of the status change

### 3. New statuses in `leads.status` CHECK constraint
- `OUT_OF_CITY`
- `NOT_ELIGIBLE`
All existing statuses are preserved.

### 4. Updated `update_lead_status` RPC
- New parameters: `p_callback_date` (date, default NULL), `p_callback_time` (time, default NULL)
- When `p_new_status = 'CALLBACK'`, stores `callback_date` and `callback_time` on the lead
  and on the `lead_status_history` row.
- When status is not CALLBACK, clears `callback_date`/`callback_time` on the lead
  (but historical rows keep their values).
- `OUT_OF_CITY` and `NOT_ELIGIBLE` are handled as terminal (non-rotating) statuses.

### 5. Updated `update_lead_platform_status` RPC
- New parameters: `p_callback_date` (date, default NULL), `p_callback_time` (time, default NULL)
- Same callback storage logic as above.
- Writes `callback_date`/`callback_time` to the `lead_status_history` row.

## Security
- No new tables created.
- No RLS policy changes — existing policies on `leads` and `lead_status_history` remain.
- Both RPCs remain SECURITY DEFINER with the same auth checks.

## Notes
- All new columns are nullable so existing rows are unaffected.
- Existing status history records will have NULL callback fields, which is correct.
- Previous status history/remarks are never overwritten — each status change
  creates a new `lead_status_history` row.
*/

-- 1. Add callback columns to leads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'callback_date'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN callback_date date;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'callback_time'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN callback_time time;
  END IF;
END $$;

-- 2. Add callback columns to lead_status_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_status_history' AND column_name = 'callback_date'
  ) THEN
    ALTER TABLE public.lead_status_history ADD COLUMN callback_date date;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_status_history' AND column_name = 'callback_time'
  ) THEN
    ALTER TABLE public.lead_status_history ADD COLUMN callback_time time;
  END IF;
END $$;

-- 3. Add new statuses to the leads CHECK constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status = ANY (ARRAY[
    'NEW','RINGING','INTERESTED','CALLBACK','ID_DONE','ID_BLOCK',
    'DOC_ISSUE','VEHICLE_ISSUE','OTHER_ISSUE','OTHER_HERO',
    'ADMIN_REVIEW','TAG_ADDED','NOT_INTERESTED','EXISTING','FRESH',
    'OTHER_NUMBER','PAYMENT_ISSUE','DONE',
    'DISCONNECTED','ACTIVE_UBER','OTHER_LOCATION','NEED_TIME',
    'WRONG_NUMBER','SWITCH_OFF',
    'OUT_OF_CITY','NOT_ELIGIBLE'
  ]));

-- 4. Updated update_lead_status RPC with callback params
CREATE OR REPLACE FUNCTION public.update_lead_status(
  p_lead_id uuid,
  p_new_status text,
  p_remarks text DEFAULT '',
  p_callback_date date DEFAULT NULL,
  p_callback_time time DEFAULT NULL
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

  -- Record status history (with callback fields).
  INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id, callback_date, callback_time)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status,
    p_new_status, p_remarks, CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid(),
    CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
    CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_time ELSE NULL END);

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
          in_admin_review = false,
          callback_date = CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
          callback_time = CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_time ELSE NULL END
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
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
    WHEN 'ID_BLOCK' THEN
      UPDATE public.leads SET status = 'ID_BLOCK', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'ID_BLOCK', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'DOC_ISSUE' THEN
      UPDATE public.leads SET status = 'DOC_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'DOCUMENT_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'VEHICLE_ISSUE' THEN
      UPDATE public.leads SET status = 'VEHICLE_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'VEHICLE_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'OTHER_ISSUE' THEN
      UPDATE public.leads SET status = 'OTHER_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      INSERT INTO public.issues (lead_id, product_id, employee_id, issue_type, issue_status, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, 'OTHER_ISSUE', 'OPEN', p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'OTHER_HERO' THEN
      UPDATE public.leads SET status = 'OTHER_HERO', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      INSERT INTO public.other_hero_leads (lead_id, product_id, employee_id, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'OUT_OF_CITY' THEN
      UPDATE public.leads SET status = 'OUT_OF_CITY', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
    WHEN 'NOT_ELIGIBLE' THEN
      UPDATE public.leads SET status = 'NOT_ELIGIBLE', remarks = p_remarks,
        last_contact_at = now(), next_followup_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
    ELSE
      UPDATE public.leads
        SET status = p_new_status, remarks = p_remarks,
            callback_date = CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
            callback_time = CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_time ELSE NULL END
        WHERE id = p_lead_id;
  END CASE;

  PERFORM public.write_audit_log('STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('from', v_lead.status, 'to', p_new_status, 'remarks', p_remarks,
      'callback_date', p_callback_date, 'callback_time', p_callback_time));
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_status(uuid, text, text, date, time) TO authenticated;

-- 5. Updated update_lead_platform_status RPC with callback params
CREATE OR REPLACE FUNCTION public.update_lead_platform_status(
  p_lead_id uuid,
  p_platform_name text,
  p_status text,
  p_remarks text DEFAULT '',
  p_callback_date date DEFAULT NULL,
  p_callback_time time DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_product_id uuid;
  v_is_admin boolean;
  v_is_owner boolean;
  v_prev_status text;
  v_existing_id uuid;
  v_remarks text;
  v_trimmed_remarks text;
BEGIN
  IF p_status IS NULL OR trim(p_status) = '' THEN
    RAISE EXCEPTION 'Status cannot be empty';
  END IF;

  SELECT product_id, status INTO v_lead_product_id, v_prev_status FROM public.leads WHERE id = p_lead_id;
  IF v_lead_product_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  v_is_admin := public.is_admin();
  v_is_owner := EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead_id AND current_caller_id = auth.uid()
  );
  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to update this lead';
  END IF;

  -- Check if a row already exists for this lead + platform
  SELECT id INTO v_existing_id FROM public.lead_platform_status
    WHERE lead_id = p_lead_id AND platform ILIKE p_platform_name LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.lead_platform_status
      SET status = p_status,
          completed_at = CASE WHEN p_status = 'ID_DONE' THEN now() ELSE completed_at END,
          completed_by = auth.uid(),
          updated_at = now()
      WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.lead_platform_status (lead_id, product_id, platform, status, completed_by, created_at, updated_at)
    VALUES (p_lead_id, v_lead_product_id, p_platform_name, p_status,
      auth.uid(), now(), now());
  END IF;

  -- Sync leads.status to the new platform status
  UPDATE public.leads
    SET status = p_status,
        updated_at = now(),
        last_contact_at = CASE WHEN p_status NOT IN ('FRESH','EXISTING') THEN now() ELSE last_contact_at END,
        callback_date = CASE WHEN p_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
        callback_time = CASE WHEN p_status = 'CALLBACK' THEN p_callback_time ELSE NULL END
    WHERE id = p_lead_id;

  -- Use user-provided remarks if non-empty for history; otherwise auto-generate
  v_trimmed_remarks := NULLIF(trim(COALESCE(p_remarks, '')), '');
  v_remarks := COALESCE(v_trimmed_remarks, p_platform_name || ' status: ' || p_status);

  -- Save remark to leads.remarks only if non-empty (don't overwrite existing with empty)
  IF v_trimmed_remarks IS NOT NULL THEN
    UPDATE public.leads SET remarks = v_trimmed_remarks, updated_at = now() WHERE id = p_lead_id;
  END IF;

  INSERT INTO public.lead_status_history (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id, callback_date, callback_time)
  VALUES (p_lead_id, v_lead_product_id, auth.uid(), v_prev_status, p_status,
         v_remarks,
         CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid(),
         CASE WHEN p_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
         CASE WHEN p_status = 'CALLBACK' THEN p_callback_time ELSE NULL END);

  PERFORM public.log_audit(
    'PLATFORM_STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('platform', p_platform_name, 'platform_status', p_status, 'lead_status', p_status, 'remarks', v_remarks,
      'callback_date', p_callback_date, 'callback_time', p_callback_time)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_platform_status(uuid, text, text, text, date, time) TO authenticated;
