-- RPC to upsert per-platform lead status
-- Reuses existing lead_platform_status table with unique(lead_id, platform_id)
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
BEGIN
  -- Validate status is not empty
  IF p_status IS NULL OR trim(p_status) = '' THEN
    RAISE EXCEPTION 'Status cannot be empty';
  END IF;

  -- Get platform id by name
  SELECT id INTO v_platform_id FROM public.platforms WHERE name ILIKE p_platform_name AND is_active = true LIMIT 1;
  IF v_platform_id IS NULL THEN
    RAISE EXCEPTION 'Platform % not found', p_platform_name;
  END IF;

  -- Get lead's product_id
  SELECT product_id INTO v_lead_product_id FROM public.leads WHERE id = p_lead_id;
  IF v_lead_product_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- Permission check
  v_is_admin := public.is_admin();
  v_is_owner := EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead_id AND current_caller_id = auth.uid()
  );
  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to update this lead';
  END IF;

  -- Upsert platform status (unique constraint on lead_id + platform_id)
  INSERT INTO public.lead_platform_status (lead_id, platform_id, status, completed_at, completed_by, updated_at)
  VALUES (p_lead_id, v_platform_id, p_status,
    CASE WHEN p_status = 'ID_DONE' THEN now() ELSE NULL END,
    auth.uid(),
    now())
  ON CONFLICT (lead_id, platform_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    completed_at = CASE WHEN EXCLUDED.status = 'ID_DONE' THEN now() ELSE NULL END,
    completed_by = auth.uid(),
    updated_at = now();

  -- Write audit log
  PERFORM public.write_audit_log(
    'PLATFORM_STATUS_CHANGE',
    'lead',
    p_lead_id::text,
    jsonb_build_object('platform', p_platform_name, 'status', p_status)
  );
END;
$$;

-- Grant to authenticated
GRANT EXECUTE ON FUNCTION public.update_lead_platform_status(uuid, text, text) TO authenticated;
