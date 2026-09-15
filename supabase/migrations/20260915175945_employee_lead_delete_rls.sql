-- Allow employees to delete (soft or hard) leads currently assigned to them,
-- only for products they are actively assigned to via caller_queues.
-- This does NOT grant access to other employees' leads, other products, or admin-only data.

CREATE POLICY "leads_employee_delete_own"
  ON leads FOR DELETE
  TO authenticated
  USING (
    current_caller_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM caller_queues cq
      WHERE cq.employee_id = auth.uid()
        AND cq.product_id = leads.product_id
        AND cq.is_active = true
    )
  );

-- Employee-safe soft delete: sets is_active = false only if the lead is
-- assigned to the calling employee for an active product they belong to.
-- SECURITY DEFINER so it can run the UPDATE regardless of RLS on leads,
-- but the ownership check inside prevents unauthorized deletes.

CREATE OR REPLACE FUNCTION public.employee_soft_delete_lead(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_lead leads%ROWTYPE;
  v_authorized boolean := false;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found or already deleted');
  END IF;

  -- Verify the calling employee is assigned to this lead's product
  SELECT EXISTS(
    SELECT 1 FROM caller_queues cq
    WHERE cq.employee_id = auth.uid()
      AND cq.product_id = v_lead.product_id
      AND cq.is_active = true
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to delete this lead');
  END IF;

  -- Verify the lead is currently assigned to this employee
  IF v_lead.current_caller_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to delete this lead');
  END IF;

  -- Soft delete
  UPDATE leads SET is_active = false WHERE id = p_lead_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.employee_soft_delete_lead(uuid) TO authenticated;
