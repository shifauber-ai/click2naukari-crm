-- Fix: the leads.status column is text (with CHECK constraint), not a custom type.
-- Remove the ::lead_status cast from update_lead_platform_status.

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
  v_platform_id uuid;
  v_lead_product_id uuid;
  v_is_admin boolean;
  v_is_owner boolean;
  v_mapped_status text;
  v_prev_status text;
BEGIN
  IF p_status IS NULL OR trim(p_status) = '' THEN
    RAISE EXCEPTION 'Status cannot be empty';
  END IF;

  SELECT id INTO v_platform_id FROM public.platforms
    WHERE name ILIKE p_platform_name AND is_active = true LIMIT 1;
  IF v_platform_id IS NULL THEN
    RAISE EXCEPTION 'Platform % not found', p_platform_name;
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

  INSERT INTO public.lead_platform_status (lead_id, platform_id, status, completed_at, completed_by, updated_at)
  VALUES (p_lead_id, v_platform_id, p_status,
    CASE WHEN p_status = 'ID_DONE' THEN now() ELSE NULL END,
    auth.uid(), now())
  ON CONFLICT (lead_id, platform_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    completed_at = CASE WHEN EXCLUDED.status = 'ID_DONE' THEN now() ELSE NULL END,
    completed_by = auth.uid(),
    updated_at = now();

  v_mapped_status := CASE
    WHEN p_status IN ('RINGING','ID_DONE','ID_BLOCK','DOC_ISSUE','VEHICLE_ISSUE',
                      'OTHER_HERO','NOT_INTERESTED','INTERESTED','CALLBACK','TAG_ADDED',
                      'ADMIN_REVIEW','NEW','OTHER_ISSUE') THEN p_status
    WHEN p_status = 'FRESH' THEN 'NEW'
    WHEN p_status = 'EXISTING' THEN 'RINGING'
    WHEN p_status IN ('OTHER_NUMBER','PAYMENT_ISSUE') THEN 'OTHER_ISSUE'
    WHEN p_status = 'DONE' THEN 'ID_DONE'
    ELSE p_status
  END;

  UPDATE public.leads
    SET status = v_mapped_status,
        updated_at = now(),
        last_contact_at = CASE WHEN p_status NOT IN ('FRESH','EXISTING') THEN now() ELSE last_contact_at END
    WHERE id = p_lead_id;

  INSERT INTO public.lead_status_history (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead_product_id, auth.uid(), v_prev_status, v_mapped_status,
         p_platform_name || ' status: ' || p_status,
         CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid());

  PERFORM public.write_audit_log(
    'PLATFORM_STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('platform', p_platform_name, 'platform_status', p_status, 'lead_status', v_mapped_status)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_platform_status(uuid, text, text) TO authenticated;
