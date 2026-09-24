/*
# Fix Status Update RPCs — Schema Alignment

## Root Cause
Both `update_lead_platform_status` and `update_lead_status` RPCs were written
against a migration-era schema that no longer matches the live database.
Every call to either RPC fails because the function bodies reference columns
and helper functions that do not exist in the actual database.

## Specific Mismatches Fixed

### lead_status_history table
- RPCs INSERT into: product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id
- Actual columns: lead_id, old_status_id (nullable uuid FK→statuses), new_status_id (NOT NULL uuid FK→statuses),
  changed_by (uuid FK→profiles), note (text), created_at, callback_date, callback_time
- Fix: look up status UUID from `statuses` table by lowercase code, insert using actual columns.

### lead_platform_status table
- RPCs reference `completed_at` column in UPDATE branch
- Actual columns: id, lead_id, product_id, platform (text), status (text), completed_by, created_at, updated_at
- Fix: remove `completed_at` references.

### issues table
- RPCs INSERT into: lead_id, product_id, employee_id, issue_type, issue_status, remarks
- Actual columns: id, lead_id, status_id (uuid FK→statuses), note, created_by, resolved_at, resolution_note, created_at
- Fix: map issue type to status_id from statuses table, use `note` and `created_by`.

### leads table
- RPCs reference `next_followup_at` — actual column is `next_follow_up_at`.
- Fix: use correct column name.

### Helper functions
- `write_audit_log` does not exist — only `log_audit` exists.
- `cancel_pending_transitions` does not exist.
- Fix: replace `write_audit_log` with `log_audit`; inline the transition cancellation logic.

### Missing statuses
- `statuses` table is missing entries for: out_of_city, not_eligible, disconnected, active_uber,
  other_location, need_time, wrong_number, switch_off, doc_issue, vehicle_issue, other_issue,
  admin_review, new, other_number, done, payment_issue (some may exist — INSERT ON CONFLICT DO NOTHING).
- Fix: insert missing statuses with IF NOT EXISTS semantics.

## Security
- No RLS policy changes.
- No new tables.
- Both RPCs remain SECURITY DEFINER with the same auth checks (is_admin OR current_caller_id = auth.uid()).
- No data is deleted or modified — only function definitions are replaced.
*/

-- ============ 1. Add missing statuses ============
-- The statuses table uses a `code` column (text, unique). We insert any
-- status codes that the frontend sends but are not yet in the table.
-- ON CONFLICT ensures idempotency.

DO $$
BEGIN
  -- Use a CTE to insert only if not exists
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'new') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('new', 'New', null, 'slate', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'other_number') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('other_number', 'Other Number', 'issues', 'red', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'done') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('done', 'Done', 'id_done', 'green', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'doc_issue') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('doc_issue', 'Doc Issue', 'issues', 'red', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'vehicle_issue') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('vehicle_issue', 'Vehicle Issue', 'issues', 'red', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'other_issue') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('other_issue', 'Other Issue', 'issues', 'red', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'admin_review') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('admin_review', 'Admin Review', null, 'slate', false, false, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'out_of_city') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('out_of_city', 'Out of City', null, 'slate', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'not_eligible') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('not_eligible', 'Not Eligible', null, 'slate', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'disconnected') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('disconnected', 'Ringing / Disconnected', null, 'amber', true, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'active_uber') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('active_uber', 'Active on Uber', null, 'slate', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'other_location') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('other_location', 'Other Location', null, 'slate', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'need_time') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('need_time', 'Need Time to Think', null, 'slate', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'wrong_number') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('wrong_number', 'Wrong Number', null, 'slate', false, false, false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.statuses WHERE code = 'switch_off') THEN
    INSERT INTO public.statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system)
    VALUES ('switch_off', 'Switch Off / Incoming Off', null, 'slate', false, false, false);
  END IF;
END $$;

-- ============ 2. Rewrite update_lead_platform_status ============
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
  v_new_status_id uuid;
  v_old_status_id uuid;
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

  -- Look up status UUID from statuses table (code is lowercase)
  SELECT id INTO v_new_status_id FROM public.statuses
    WHERE code = lower(p_status) LIMIT 1;

  -- Look up old status UUID if previous status exists
  IF v_prev_status IS NOT NULL THEN
    SELECT id INTO v_old_status_id FROM public.statuses
      WHERE code = lower(v_prev_status) LIMIT 1;
  END IF;

  -- Check if a row already exists for this lead + platform
  SELECT id INTO v_existing_id FROM public.lead_platform_status
    WHERE lead_id = p_lead_id AND platform ILIKE p_platform_name LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.lead_platform_status
      SET status = p_status,
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

  -- Insert into lead_status_history using actual schema columns
  -- new_status_id is NOT NULL, so only insert if we found the status UUID
  IF v_new_status_id IS NOT NULL THEN
    INSERT INTO public.lead_status_history
      (lead_id, old_status_id, new_status_id, changed_by, note, callback_date, callback_time)
    VALUES (p_lead_id, v_old_status_id, v_new_status_id, auth.uid(), v_remarks,
      CASE WHEN p_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
      CASE WHEN p_status = 'CALLBACK' THEN p_callback_time ELSE NULL END);
  END IF;

  PERFORM public.log_audit(
    'PLATFORM_STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('platform', p_platform_name, 'platform_status', p_status, 'lead_status', p_status, 'remarks', v_remarks,
      'callback_date', p_callback_date, 'callback_time', p_callback_time)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_platform_status(uuid, text, text, text, date, time) TO authenticated;

-- ============ 3. Rewrite update_lead_status ============
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
  v_new_status_id uuid;
  v_old_status_id uuid;
  v_issue_status_id uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  v_is_admin := public.is_admin();
  v_is_owner := (auth.uid() = v_lead.current_caller_id);
  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to update this lead';
  END IF;

  -- Cancel stale pending transitions inline (cancel_pending_transitions doesn't exist)
  UPDATE public.scheduled_transitions
    SET status = 'CANCELLED', processed_at = now()
    WHERE lead_id = p_lead_id AND status = 'PENDING';

  -- Look up status UUIDs from statuses table
  SELECT id INTO v_new_status_id FROM public.statuses WHERE code = lower(p_new_status) LIMIT 1;
  IF v_lead.status IS NOT NULL THEN
    SELECT id INTO v_old_status_id FROM public.statuses WHERE code = lower(v_lead.status) LIMIT 1;
  END IF;

  -- Record status history (only if we have a valid status UUID)
  IF v_new_status_id IS NOT NULL THEN
    INSERT INTO public.lead_status_history
      (lead_id, old_status_id, new_status_id, changed_by, note, callback_date, callback_time)
    VALUES (p_lead_id, v_old_status_id, v_new_status_id, auth.uid(),
      COALESCE(NULLIF(trim(COALESCE(p_remarks, '')), ''), p_new_status),
      CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
      CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_time ELSE NULL END);
  END IF;

  -- Determine transition type + delay for rotating statuses
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
          next_follow_up_at = v_next_action,
          in_admin_review = false,
          callback_date = CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
          callback_time = CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_time ELSE NULL END
      WHERE id = p_lead_id;
    INSERT INTO public.scheduled_transitions
      (lead_id, product_id, current_caller_id, expected_status, next_action_at,
       transition_type, status, attempt_number)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_new_status,
      v_next_action, v_transition_type, 'PENDING', v_lead.rotation_count + 1);
    PERFORM public.log_audit(
      'STATUS_CHANGE', 'lead', p_lead_id::text,
      jsonb_build_object('from', v_lead.status, 'to', p_new_status, 'remarks', p_remarks,
        'callback_date', p_callback_date, 'callback_time', p_callback_time));
    RETURN;
  END IF;

  -- Terminal / non-rotating statuses
  CASE p_new_status
    WHEN 'ID_DONE' THEN
      UPDATE public.leads SET status = 'ID_DONE', remarks = p_remarks,
        last_contact_at = now(), next_follow_up_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
    WHEN 'ID_BLOCK' THEN
      UPDATE public.leads SET status = 'ID_BLOCK', remarks = p_remarks,
        last_contact_at = now(), next_follow_up_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      -- Insert issue using actual schema: lead_id, status_id, note, created_by
      SELECT id INTO v_issue_status_id FROM public.statuses WHERE code = 'id_block' LIMIT 1;
      IF v_issue_status_id IS NOT NULL THEN
        INSERT INTO public.issues (lead_id, status_id, note, created_by)
        VALUES (p_lead_id, v_issue_status_id, p_remarks, auth.uid())
        ON CONFLICT DO NOTHING;
      END IF;
    WHEN 'DOC_ISSUE' THEN
      UPDATE public.leads SET status = 'DOC_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_follow_up_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      SELECT id INTO v_issue_status_id FROM public.statuses WHERE code = 'doc_issue' LIMIT 1;
      IF v_issue_status_id IS NOT NULL THEN
        INSERT INTO public.issues (lead_id, status_id, note, created_by)
        VALUES (p_lead_id, v_issue_status_id, p_remarks, auth.uid())
        ON CONFLICT DO NOTHING;
      END IF;
    WHEN 'VEHICLE_ISSUE' THEN
      UPDATE public.leads SET status = 'VEHICLE_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_follow_up_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      SELECT id INTO v_issue_status_id FROM public.statuses WHERE code = 'vehicle_issue' LIMIT 1;
      IF v_issue_status_id IS NOT NULL THEN
        INSERT INTO public.issues (lead_id, status_id, note, created_by)
        VALUES (p_lead_id, v_issue_status_id, p_remarks, auth.uid())
        ON CONFLICT DO NOTHING;
      END IF;
    WHEN 'OTHER_ISSUE' THEN
      UPDATE public.leads SET status = 'OTHER_ISSUE', remarks = p_remarks,
        last_contact_at = now(), next_follow_up_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      SELECT id INTO v_issue_status_id FROM public.statuses WHERE code = 'other_issue' LIMIT 1;
      IF v_issue_status_id IS NOT NULL THEN
        INSERT INTO public.issues (lead_id, status_id, note, created_by)
        VALUES (p_lead_id, v_issue_status_id, p_remarks, auth.uid())
        ON CONFLICT DO NOTHING;
      END IF;
    WHEN 'OTHER_HERO' THEN
      UPDATE public.leads SET status = 'OTHER_HERO', remarks = p_remarks,
        last_contact_at = now(), next_follow_up_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
      INSERT INTO public.other_hero_leads (lead_id, product_id, employee_id, remarks)
      VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, p_remarks)
      ON CONFLICT DO NOTHING;
    WHEN 'OUT_OF_CITY' THEN
      UPDATE public.leads SET status = 'OUT_OF_CITY', remarks = p_remarks,
        last_contact_at = now(), next_follow_up_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
    WHEN 'NOT_ELIGIBLE' THEN
      UPDATE public.leads SET status = 'NOT_ELIGIBLE', remarks = p_remarks,
        last_contact_at = now(), next_follow_up_at = NULL, in_admin_review = false,
        callback_date = NULL, callback_time = NULL
        WHERE id = p_lead_id;
    ELSE
      -- Generic fallback for any other status (DISCONNECTED, ACTIVE_UBER, etc.)
      UPDATE public.leads
        SET status = p_new_status, remarks = p_remarks,
            callback_date = CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_date ELSE NULL END,
            callback_time = CASE WHEN p_new_status = 'CALLBACK' THEN p_callback_time ELSE NULL END
        WHERE id = p_lead_id;
  END CASE;

  PERFORM public.log_audit(
    'STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('from', v_lead.status, 'to', p_new_status, 'remarks', p_remarks,
      'callback_date', p_callback_date, 'callback_time', p_callback_time));
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_status(uuid, text, text, date, time) TO authenticated;
