-- Expand leads.status CHECK constraint to allow raw platform statuses
-- (EXISTING, FRESH, OTHER_NUMBER, PAYMENT_ISSUE, DONE) so that
-- update_lead_platform_status can store the exact platform status
-- without mapping it to a different LeadStatus.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status = ANY (ARRAY[
    'NEW'::text, 'RINGING'::text, 'INTERESTED'::text, 'CALLBACK'::text,
    'ID_DONE'::text, 'ID_BLOCK'::text, 'DOC_ISSUE'::text, 'VEHICLE_ISSUE'::text,
    'OTHER_ISSUE'::text, 'OTHER_HERO'::text, 'ADMIN_REVIEW'::text, 'TAG_ADDED'::text,
    'NOT_INTERESTED'::text, 'EXISTING'::text, 'FRESH'::text,
    'OTHER_NUMBER'::text, 'PAYMENT_ISSUE'::text, 'DONE'::text
  ]));

-- Update RPC to store the raw platform status directly (no mapping)
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

  -- Store the raw platform status directly in leads.status
  UPDATE public.leads
    SET status = p_status,
        updated_at = now(),
        last_contact_at = CASE WHEN p_status NOT IN ('FRESH','EXISTING') THEN now() ELSE last_contact_at END
    WHERE id = p_lead_id;

  INSERT INTO public.lead_status_history (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead_product_id, auth.uid(), v_prev_status, p_status,
         p_platform_name || ' status: ' || p_status,
         CASE WHEN v_is_admin THEN 'ADMIN' ELSE 'EMPLOYEE' END, auth.uid());

  PERFORM public.write_audit_log(
    'PLATFORM_STATUS_CHANGE', 'lead', p_lead_id::text,
    jsonb_build_object('platform', p_platform_name, 'platform_status', p_status, 'lead_status', p_status)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_platform_status(uuid, text, text) TO authenticated;
