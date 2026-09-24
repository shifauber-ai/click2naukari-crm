-- Add new lead statuses to the CHECK constraint
-- New statuses: DISCONNECTED, ACTIVE_UBER, OTHER_LOCATION, NEED_TIME, WRONG_NUMBER, SWITCH_OFF
-- INTERESTED and CALLBACK already exist in the constraint

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status = ANY (ARRAY[
    'NEW','RINGING','INTERESTED','CALLBACK','ID_DONE','ID_BLOCK',
    'DOC_ISSUE','VEHICLE_ISSUE','OTHER_ISSUE','OTHER_HERO',
    'ADMIN_REVIEW','TAG_ADDED','NOT_INTERESTED','EXISTING','FRESH',
    'OTHER_NUMBER','PAYMENT_ISSUE','DONE',
    'DISCONNECTED','ACTIVE_UBER','OTHER_LOCATION','NEED_TIME',
    'WRONG_NUMBER','SWITCH_OFF'
  ]));

-- Update the RPC to also save the remark to leads.remarks (lead-level remark)
-- while preserving the lead_status_history remark (history-level).
-- If p_remarks is empty, preserve the existing lead remark (don't overwrite with empty).
CREATE OR REPLACE FUNCTION public.update_lead_platform_status(
  p_lead_id uuid,
  p_platform_name text,
  p_status text,
  p_remarks text DEFAULT ''
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
        last_contact_at = CASE WHEN p_status NOT IN ('FRESH','EXISTING') THEN now() ELSE last_contact_at END
    WHERE id = p_lead_id;

  -- Use user-provided remarks if non-empty for history; otherwise auto-generate
  v_trimmed_remarks := NULLIF(trim(COALESCE(p_remarks, '')), '');
  v_remarks := COALESCE(v_trimmed_remarks, p_platform_name || ' status: ' || p_status);

  -- Save remark to leads.remarks only if non-empty (don't overwrite existing with empty)
  IF v_trimmed_remarks IS NOT NULL THEN
    UPDATE public.leads SET remarks = v_trimmed_remarks, updated_at = now() WHERE id = p_lead_id;
  END IF;

  INSERT INTO public.lead_status_history (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead_product_id, auth.uid(), v_prev_status, p_status,
         v_remarks,
         CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid());

  PERFORM public.log_audit(
    'PLATFORM_STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('platform', p_platform_name, 'platform_status', p_status, 'lead_status', p_status, 'remarks', v_remarks)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_platform_status(uuid, text, text, text) TO authenticated;
