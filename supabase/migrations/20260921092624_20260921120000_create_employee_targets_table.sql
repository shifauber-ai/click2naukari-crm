/*
# Create employee_targets table for Target module

## Overview
This migration creates the `employee_targets` table to store per-employee performance targets
for specific products. Targets are typed (e.g., ULP Mumbai, Ola Pune, Rapido, FT), have a
period (daily/weekly/monthly/custom), and track active/inactive status. Achievement is
calculated at runtime from existing CRM data (leads, payment_records) — no manual achieved input.

## New Table: employee_targets
- `id` (uuid, PK, default gen_random_uuid())
- `employee_id` (uuid, FK → profiles.id ON DELETE CASCADE, NOT NULL) — the employee the target is assigned to
- `product_id` (uuid, FK → products.id ON DELETE CASCADE, NOT NULL) — the product this target belongs to
- `target_type` (text, NOT NULL) — e.g. ULP_MUMBAI, OLA_PUNE, RAPIDO, FT, ULP, OLA_COLLECTION
- `target_value` (numeric, NOT NULL, default 0, CHECK >= 0) — the target number to achieve
- `period_type` (text, NOT NULL, CHECK IN DAILY/WEEKLY/MONTHLY/CUSTOM)
- `start_date` (date, NOT NULL) — start of the target period
- `end_date` (date, NOT NULL) — end of the target period
- `is_active` (boolean, NOT NULL, default true) — whether the target is active
- `created_by` (uuid, FK → profiles.id ON DELETE SET NULL, default auth.uid()) — who created the target
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Security (RLS)
- Admin: full CRUD on all targets (via is_admin())
- Manager: full CRUD on targets for products they're assigned to (via manager_product_assignments)
- Employee: SELECT only their own targets (where employee_id = auth.uid())
  Employees CANNOT create, edit, or delete targets — no INSERT/UPDATE/DELETE policies for them.

## Indexes
- Unique partial index preventing duplicate active targets for same employee + product + target_type + period_type + start_date
- Index on employee_id for employee self-queries
- Index on product_id for product-filtered queries

## Notes
1. Achievement is NOT stored — it is calculated from existing leads/payment_records at runtime.
2. The unique index only applies to active targets, allowing deactivated targets to remain as history.
3. start_date and end_date are always both stored (for Daily, both are the same date).
*/

CREATE TABLE IF NOT EXISTS employee_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_value numeric NOT NULL DEFAULT 0 CHECK (target_value >= 0),
  period_type text NOT NULL CHECK (period_type IN ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_targets ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_targets_employee ON employee_targets(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_targets_product ON employee_targets(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_employee_target
  ON employee_targets (employee_id, product_id, target_type, period_type, start_date)
  WHERE is_active = true;

-- Updated_at trigger (reuses existing set_updated_at() function from core schema)
DROP TRIGGER IF EXISTS trg_employee_targets_updated ON employee_targets;
CREATE TRIGGER trg_employee_targets_updated
  BEFORE UPDATE ON employee_targets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ RLS POLICIES ============

-- Admin: full CRUD on all targets
DROP POLICY IF EXISTS "admin_select_targets" ON employee_targets;
CREATE POLICY "admin_select_targets" ON employee_targets FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_targets" ON employee_targets;
CREATE POLICY "admin_insert_targets" ON employee_targets FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_targets" ON employee_targets;
CREATE POLICY "admin_update_targets" ON employee_targets FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_targets" ON employee_targets;
CREATE POLICY "admin_delete_targets" ON employee_targets FOR DELETE
  TO authenticated USING (is_admin());

-- Manager: CRUD for products they're assigned to
DROP POLICY IF EXISTS "manager_select_targets" ON employee_targets;
CREATE POLICY "manager_select_targets" ON employee_targets FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = employee_targets.product_id
    )
  );

DROP POLICY IF EXISTS "manager_insert_targets" ON employee_targets;
CREATE POLICY "manager_insert_targets" ON employee_targets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = employee_targets.product_id
    )
  );

DROP POLICY IF EXISTS "manager_update_targets" ON employee_targets;
CREATE POLICY "manager_update_targets" ON employee_targets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = employee_targets.product_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = employee_targets.product_id
    )
  );

DROP POLICY IF EXISTS "manager_delete_targets" ON employee_targets;
CREATE POLICY "manager_delete_targets" ON employee_targets FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = employee_targets.product_id
    )
  );

-- Employee: SELECT only their own targets (no INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "employee_select_own_targets" ON employee_targets;
CREATE POLICY "employee_select_own_targets" ON employee_targets FOR SELECT
  TO authenticated USING (auth.uid() = employee_id);
