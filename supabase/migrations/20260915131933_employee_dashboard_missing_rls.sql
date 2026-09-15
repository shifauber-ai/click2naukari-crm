-- Employee dashboard: add missing RLS policies

-- 1. Employees can INSERT leads (for manual lead entry) — scoped to caller queue products
CREATE POLICY "leads_employee_insert"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM caller_queues cq
      WHERE cq.employee_id = auth.uid()
        AND cq.product_id = leads.product_id
        AND cq.is_active = true
    )
    OR is_admin()
    OR (is_manager() AND product_id = ANY(assigned_product_ids()))
  );

-- 2. Employees can SELECT product_platforms
CREATE POLICY "product_platforms_employee_select"
  ON product_platforms FOR SELECT
  TO authenticated
  USING (true);

-- 3. Employees can SELECT product_cities
CREATE POLICY "product_cities_employee_select"
  ON product_cities FOR SELECT
  TO authenticated
  USING (true);

-- 4. Employees can INSERT lead_status_history
CREATE POLICY "lead_status_hist_employee_insert"
  ON lead_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    OR is_admin()
    OR is_manager()
  );

-- 5. Employees can INSERT caller_devices (register own device)
CREATE POLICY "caller_devices_employee_insert"
  ON caller_devices FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());
