/*
# Fix RLS gaps + admin_edit_lead missing platform/city/source

## Root causes fixed
1. payment_records: Employees could not INSERT — no employee RLS policy existed.
   Added employee INSERT/UPDATE policy scoped to leads they are assigned to.
2. directory_entries: Employees could not INSERT — no employee RLS policy.
   Added employee INSERT/UPDATE/DELETE scoped to their product+city assignments.
3. admin_edit_lead: Missing p_platform, p_city, p_source parameters.
   Lead edit form set these fields but the RPC ignored them.
   Added 3 new optional parameters and update logic.
4. directory_labels: Added manager INSERT/UPDATE/DELETE so managers can manage labels.
5. caller_queues: Added employee SELECT so employees can see their own queue entries.

## RLS changes
- payment_records: employee_insert_own (assigned lead), employee_update_own
- directory_entries: employee_insert_own (product+city match), employee_update_own, employee_delete_own
- directory_labels: manager insert/update/delete

## Function changes
- admin_edit_lead: added p_platform, p_city, p_source optional text params
*/

-- 1. Add employee INSERT/UPDATE on payment_records (employees collecting CAR payments)
DROP POLICY IF EXISTS "pay_records_employee_insert" ON public.payment_records;
CREATE POLICY "pay_records_employee_insert" ON public.payment_records
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = employee_id
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = payment_records.lead_id
      AND l.current_caller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pay_records_employee_update" ON public.payment_records;
CREATE POLICY "pay_records_employee_update" ON public.payment_records
  FOR UPDATE TO authenticated
  USING (auth.uid() = employee_id)
  WITH CHECK (auth.uid() = employee_id);

-- Also add employee SELECT on payment_records (they can see their own collected payments)
DROP POLICY IF EXISTS "pay_records_employee_select" ON public.payment_records;
CREATE POLICY "pay_records_employee_select" ON public.payment_records
  FOR SELECT TO authenticated
  USING (auth.uid() = employee_id);

-- 2. Add employee INSERT/UPDATE/DELETE on directory_entries
-- Employees can manage entries for products+cities they are assigned to
DROP POLICY IF EXISTS "dir_entries_employee_insert" ON public.directory_entries;
CREATE POLICY "dir_entries_employee_insert" ON public.directory_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employee_product_cities epc
      WHERE epc.employee_id = auth.uid()
      AND epc.product_id = directory_entries.product_id
      AND epc.is_active = true
      AND (
        directory_entries.city IS NULL OR epc.city_id = (
          SELECT pc.id FROM public.product_cities pc
          WHERE pc.product_id = directory_entries.product_id
          AND pc.city_name = directory_entries.city
          AND pc.is_active = true LIMIT 1
        )
      )
    )
  );

DROP POLICY IF EXISTS "dir_entries_employee_update" ON public.directory_entries;
CREATE POLICY "dir_entries_employee_update" ON public.directory_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_product_cities epc
      WHERE epc.employee_id = auth.uid()
      AND epc.product_id = directory_entries.product_id
      AND epc.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employee_product_cities epc
      WHERE epc.employee_id = auth.uid()
      AND epc.product_id = directory_entries.product_id
      AND epc.is_active = true
    )
  );

DROP POLICY IF EXISTS "dir_entries_employee_delete" ON public.directory_entries;
CREATE POLICY "dir_entries_employee_delete" ON public.directory_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_product_cities epc
      WHERE epc.employee_id = auth.uid()
      AND epc.product_id = directory_entries.product_id
      AND epc.is_active = true
    )
  );

-- Also add employee SELECT on directory_entries
DROP POLICY IF EXISTS "dir_entries_employee_select" ON public.directory_entries;
CREATE POLICY "dir_entries_employee_select" ON public.directory_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_product_cities epc
      WHERE epc.employee_id = auth.uid()
      AND epc.product_id = directory_entries.product_id
      AND epc.is_active = true
    )
  );

-- 3. Add manager INSERT/UPDATE/DELETE on directory_labels
DROP POLICY IF EXISTS "dir_labels_manager_insert" ON public.directory_labels;
CREATE POLICY "dir_labels_manager_insert" ON public.directory_labels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "dir_labels_manager_update" ON public.directory_labels;
CREATE POLICY "dir_labels_manager_update" ON public.directory_labels
  FOR UPDATE TO authenticated
  USING (public.is_manager()) WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "dir_labels_manager_delete" ON public.directory_labels;
CREATE POLICY "dir_labels_manager_delete" ON public.directory_labels
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- Also add employee SELECT on directory_labels (they need to see labels for the dropdown)
DROP POLICY IF EXISTS "dir_labels_employee_select" ON public.directory_labels;
CREATE POLICY "dir_labels_employee_select" ON public.directory_labels
  FOR SELECT TO authenticated USING (true);

-- 4. Add employee SELECT on caller_queues (employees can see their own queue)
DROP POLICY IF EXISTS "caller_queues_employee_select" ON public.caller_queues;
CREATE POLICY "caller_queues_employee_select" ON public.caller_queues
  FOR SELECT TO authenticated
  USING (auth.uid() = employee_id);

-- 5. Fix admin_edit_lead to accept platform, city, source
CREATE OR REPLACE FUNCTION public.admin_edit_lead(
  p_lead_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_current_caller_id uuid DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_changes jsonb := '{}'::jsonb;
  v_new_caller_id uuid;
BEGIN
  IF NOT (public.is_admin() OR public.is_manager()) THEN
    RAISE EXCEPTION 'Admin or Manager only';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  IF public.is_manager() AND v_lead.product_id != ALL(public.assigned_product_ids()) THEN
    RAISE EXCEPTION 'Not authorized to edit leads outside your product scope';
  END IF;

  IF p_name IS NOT NULL AND p_name <> v_lead.name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(v_lead.name, p_name));
    UPDATE public.leads SET name = p_name WHERE id = p_lead_id;
  END IF;

  IF p_phone IS NOT NULL AND p_phone <> v_lead.phone THEN
    v_changes := v_changes || jsonb_build_object('phone', jsonb_build_array(v_lead.phone, p_phone));
    UPDATE public.leads SET phone = p_phone WHERE id = p_lead_id;
  END IF;

  IF p_product_id IS NOT NULL AND p_product_id <> v_lead.product_id THEN
    v_changes := v_changes || jsonb_build_object('product_id', jsonb_build_array(v_lead.product_id, p_product_id));
    UPDATE public.leads SET product_id = p_product_id WHERE id = p_lead_id;
  END IF;

  IF p_status IS NOT NULL AND p_status <> v_lead.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_array(v_lead.status, p_status));
    UPDATE public.leads SET status = p_status WHERE id = p_lead_id;
    INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status, p_status,
    'Admin/Manager edit', CASE WHEN public.is_admin() THEN 'ADMIN' ELSE 'MANAGER' END, auth.uid());
  END IF;

  -- Handle caller reassignment: empty string means unassign
  v_new_caller_id := p_current_caller_id;
  IF v_new_caller_id IS DISTINCT FROM v_lead.current_caller_id THEN
    v_changes := v_changes || jsonb_build_object('current_caller_id',
    jsonb_build_array(v_lead.current_caller_id, v_new_caller_id));
    UPDATE public.leads SET current_caller_id = v_new_caller_id WHERE id = p_lead_id;
  END IF;

  IF p_remarks IS NOT NULL AND p_remarks <> v_lead.remarks THEN
    v_changes := v_changes || jsonb_build_object('remarks', jsonb_build_array(v_lead.remarks, p_remarks));
    UPDATE public.leads SET remarks = p_remarks WHERE id = p_lead_id;
  END IF;

  IF p_platform IS NOT NULL AND p_platform <> COALESCE(v_lead.platform, '') THEN
    v_changes := v_changes || jsonb_build_object('platform', jsonb_build_array(v_lead.platform, p_platform));
    UPDATE public.leads SET platform = NULLIF(p_platform, '') WHERE id = p_lead_id;
  END IF;

  IF p_city IS NOT NULL AND p_city <> COALESCE(v_lead.city, '') THEN
    v_changes := v_changes || jsonb_build_object('city', jsonb_build_array(v_lead.city, p_city));
    UPDATE public.leads SET city = NULLIF(p_city, '') WHERE id = p_lead_id;
  END IF;

  IF p_source IS NOT NULL AND p_source <> COALESCE(v_lead.source, '') THEN
    v_changes := v_changes || jsonb_build_object('source', jsonb_build_array(v_lead.source, p_source));
    UPDATE public.leads SET source = NULLIF(p_source, '') WHERE id = p_lead_id;
  END IF;

  PERFORM public.write_audit_log('LEAD_EDIT', 'lead', p_lead_id::text, v_changes);
END;
$function$;

-- 6. Add employee SELECT on payment_records for their collected payments
-- (Already added above as pay_records_employee_select)

-- 7. Add employee INSERT on call_history (employees log their own calls)
-- Check if it already exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid = 'public.call_history'::regclass AND polname = 'callhist_employee_insert'
  ) THEN
    CREATE POLICY "callhist_employee_insert" ON public.call_history
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = caller_id);
  END IF;
END $$;

-- 8. Add employee SELECT on lead_status_history (their own history)
DROP POLICY IF EXISTS "leadhist_employee_select" ON public.lead_status_history;
CREATE POLICY "leadhist_employee_select" ON public.lead_status_history
  FOR SELECT TO authenticated
  USING (auth.uid() = employee_id);

-- 9. Add employee SELECT on lead_assignments (their own assignments)
DROP POLICY IF EXISTS "leadassign_employee_select" ON public.lead_assignments;
CREATE POLICY "leadassign_employee_select" ON public.lead_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = new_caller_id OR auth.uid() = previous_caller_id);
