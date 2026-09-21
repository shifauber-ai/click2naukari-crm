/*
# Create employee_targets table for the Target module

1. New Tables
- `employee_targets`
  - `id` (uuid, PK, default gen_random_uuid)
  - `employee_id` (uuid, NOT NULL, FK to profiles.id ON DELETE CASCADE)
  - `product_id` (uuid, NOT NULL, FK to products.id ON DELETE CASCADE)
  - `target_type` (text, NOT NULL) — e.g. "ULP_MUMBAI", "ULP_PUNE", "OLA_MUMBAI", etc.
  - `target_value` (integer, NOT NULL, check > 0)
  - `period_type` (text, NOT NULL, check in DAILY/WEEKLY/MONTHLY/CUSTOM)
  - `start_date` (date, NOT NULL)
  - `end_date` (date, nullable — required only for CUSTOM)
  - `is_active` (boolean, NOT NULL, default true)
  - `created_by` (uuid, NOT NULL, FK to profiles.id)
  - `created_at` (timestamptz, default now)
  - `updated_at` (timestamptz, default now)

2. Constraints
- Unique index to prevent duplicate active targets for the same
  employee + product + target_type + period_type + start_date.
  This allows re-creating a target after deactivation but prevents
  two active targets with the same key dimensions.

3. Security (RLS)
- Enable RLS on `employee_targets`.
- Admins (role = 'ADMIN'): full CRUD on all targets.
- Managers (role = 'MANAGER'): full CRUD on targets for products they are assigned to
  via manager_product_assignments.
- Employees (role = 'EMPLOYEE'): SELECT only their own targets (employee_id = auth.uid()).
- No anon access.

4. Important Notes
- Target types are validated in the application layer, not the database,
  to allow flexibility across products (Car vs Bike vs Tempo vs Auto).
- The unique constraint only applies to is_active = true targets to allow
  historical/inactive records to coexist.
*/

CREATE TABLE IF NOT EXISTS employee_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_value integer NOT NULL CHECK (target_value > 0),
  period_type text NOT NULL CHECK (period_type IN ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_targets ENABLE ROW LEVEL SECURITY;

-- Unique index to prevent duplicate active targets
CREATE UNIQUE INDEX IF NOT EXISTS employee_targets_unique_active
  ON employee_targets (employee_id, product_id, target_type, period_type, start_date)
  WHERE is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_employee_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS employee_targets_updated_at ON employee_targets;
CREATE TRIGGER employee_targets_updated_at
  BEFORE UPDATE ON employee_targets
  FOR EACH ROW EXECUTE FUNCTION update_employee_targets_updated_at();

-- Admin: full CRUD on all targets
DROP POLICY IF EXISTS "admin_select_all_targets" ON employee_targets;
CREATE POLICY "admin_select_all_targets"
  ON employee_targets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "admin_insert_targets" ON employee_targets;
CREATE POLICY "admin_insert_targets"
  ON employee_targets FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "admin_update_targets" ON employee_targets;
CREATE POLICY "admin_update_targets"
  ON employee_targets FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "admin_delete_targets" ON employee_targets;
CREATE POLICY "admin_delete_targets"
  ON employee_targets FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

-- Manager: full CRUD on targets for products they are assigned to
DROP POLICY IF EXISTS "manager_select_targets" ON employee_targets;
CREATE POLICY "manager_select_targets"
  ON employee_targets FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'MANAGER')
    AND EXISTS (
      SELECT 1 FROM manager_product_assignments
      WHERE manager_product_assignments.manager_id = auth.uid()
      AND manager_product_assignments.product_id = employee_targets.product_id
    )
  );

DROP POLICY IF EXISTS "manager_insert_targets" ON employee_targets;
CREATE POLICY "manager_insert_targets"
  ON employee_targets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'MANAGER')
    AND EXISTS (
      SELECT 1 FROM manager_product_assignments
      WHERE manager_product_assignments.manager_id = auth.uid()
      AND manager_product_assignments.product_id = employee_targets.product_id
    )
  );

DROP POLICY IF EXISTS "manager_update_targets" ON employee_targets;
CREATE POLICY "manager_update_targets"
  ON employee_targets FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'MANAGER')
    AND EXISTS (
      SELECT 1 FROM manager_product_assignments
      WHERE manager_product_assignments.manager_id = auth.uid()
      AND manager_product_assignments.product_id = employee_targets.product_id
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'MANAGER')
    AND EXISTS (
      SELECT 1 FROM manager_product_assignments
      WHERE manager_product_assignments.manager_id = auth.uid()
      AND manager_product_assignments.product_id = employee_targets.product_id
    )
  );

DROP POLICY IF EXISTS "manager_delete_targets" ON employee_targets;
CREATE POLICY "manager_delete_targets"
  ON employee_targets FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'MANAGER')
    AND EXISTS (
      SELECT 1 FROM manager_product_assignments
      WHERE manager_product_assignments.manager_id = auth.uid()
      AND manager_product_assignments.product_id = employee_targets.product_id
    )
  );

-- Employee: SELECT only their own targets
DROP POLICY IF EXISTS "employee_select_own_targets" ON employee_targets;
CREATE POLICY "employee_select_own_targets"
  ON employee_targets FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'EMPLOYEE')
  );

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_employee_targets_employee ON employee_targets(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_targets_product ON employee_targets(product_id);
CREATE INDEX IF NOT EXISTS idx_employee_targets_active ON employee_targets(is_active) WHERE is_active = true;
