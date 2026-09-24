-- Fix update_lead_platform_status to match actual lead_platform_status schema
-- The table has: lead_id, product_id, platform (text), status (text), completed_by
-- No platform_id column, no unique constraint on (lead_id, platform)
CREATE OR REPLACE FUNCTION public.update_lead_platform_status(
  p_lead_id uuid,
  p_platform_name text,
  p_status text
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

  INSERT INTO public.lead_status_history (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead_product_id, auth.uid(), v_prev_status, p_status,
         p_platform_name || ' status: ' || p_status,
         CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid());

  PERFORM public.log_audit(
    'PLATFORM_STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('platform', p_platform_name, 'platform_status', p_status, 'lead_status', p_status)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_platform_status(uuid, text, text) TO authenticated;
