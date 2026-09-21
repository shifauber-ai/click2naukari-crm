-- Create target_metrics table for dynamic, product-specific target columns
CREATE TABLE IF NOT EXISTS target_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  key text NOT NULL,
  value_type text NOT NULL DEFAULT 'COUNT' CHECK (value_type IN ('COUNT', 'AMOUNT')),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE target_metrics ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_target_metrics_product ON target_metrics(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_target_metrics_product_key
  ON target_metrics (product_id, key) WHERE is_active = true;

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_target_metrics_updated ON target_metrics;
CREATE TRIGGER trg_target_metrics_updated
  BEFORE UPDATE ON target_metrics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ RLS POLICIES ============

-- Admin: full CRUD
DROP POLICY IF EXISTS "admin_select_target_metrics" ON target_metrics;
CREATE POLICY "admin_select_target_metrics" ON target_metrics FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_target_metrics" ON target_metrics;
CREATE POLICY "admin_insert_target_metrics" ON target_metrics FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_target_metrics" ON target_metrics;
CREATE POLICY "admin_update_target_metrics" ON target_metrics FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_target_metrics" ON target_metrics;
CREATE POLICY "admin_delete_target_metrics" ON target_metrics FOR DELETE
  TO authenticated USING (is_admin());

-- Manager: CRUD for products they're assigned to
DROP POLICY IF EXISTS "manager_select_target_metrics" ON target_metrics;
CREATE POLICY "manager_select_target_metrics" ON target_metrics FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = target_metrics.product_id
    )
  );

DROP POLICY IF EXISTS "manager_insert_target_metrics" ON target_metrics;
CREATE POLICY "manager_insert_target_metrics" ON target_metrics FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = target_metrics.product_id
    )
  );

DROP POLICY IF EXISTS "manager_update_target_metrics" ON target_metrics;
CREATE POLICY "manager_update_target_metrics" ON target_metrics FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = target_metrics.product_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = target_metrics.product_id
    )
  );

DROP POLICY IF EXISTS "manager_delete_target_metrics" ON target_metrics;
CREATE POLICY "manager_delete_target_metrics" ON target_metrics FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM manager_product_assignments mpa
      WHERE mpa.manager_id = auth.uid() AND mpa.product_id = target_metrics.product_id
    )
  );

-- Employee: SELECT only (for dynamic display)
DROP POLICY IF EXISTS "employee_select_target_metrics" ON target_metrics;
CREATE POLICY "employee_select_target_metrics" ON target_metrics FOR SELECT
  TO authenticated USING (true);

-- ============ Add target_metric_id to employee_targets ============
ALTER TABLE employee_targets ADD COLUMN IF NOT EXISTS target_metric_id uuid REFERENCES target_metrics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_targets_metric ON employee_targets(target_metric_id);

-- ============ Seed default metrics for each product ============
-- Helper to slugify
DO $$
DECLARE
  p RECORD;
  car_id uuid;
  bike_id uuid;
  auto_id uuid;
  tempo_id uuid;
BEGIN
  -- Find main product IDs
  SELECT id INTO car_id FROM products WHERE code = 'MAINC001' LIMIT 1;
  SELECT id INTO bike_id FROM products WHERE code = 'MAINB001' LIMIT 1;
  SELECT id INTO auto_id FROM products WHERE code = 'MAINA001' LIMIT 1;
  SELECT id INTO tempo_id FROM products WHERE code = 'MAINT001' LIMIT 1;

  -- Car metrics (7 columns)
  IF car_id IS NOT NULL THEN
    INSERT INTO target_metrics (product_id, name, key, value_type, display_order)
    VALUES
      (car_id, 'Mumbai ULP', 'MUMBAI_ULP', 'COUNT', 1),
      (car_id, 'Pune ULP', 'PUNE_ULP', 'COUNT', 2),
      (car_id, 'Mumbai Ola', 'MUMBAI_OLA', 'COUNT', 3),
      (car_id, 'Pune Ola', 'PUNE_OLA', 'COUNT', 4),
      (car_id, 'Ola Collection', 'OLA_COLLECTION', 'AMOUNT', 5),
      (car_id, 'Rapido', 'RAPIDO', 'COUNT', 6),
      (car_id, 'FT', 'FT', 'COUNT', 7)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Bike metrics (2 columns)
  IF bike_id IS NOT NULL THEN
    INSERT INTO target_metrics (product_id, name, key, value_type, display_order)
    VALUES
      (bike_id, 'ULP', 'ULP', 'COUNT', 1),
      (bike_id, 'FT', 'FT', 'COUNT', 2)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Auto metrics (3 columns)
  IF auto_id IS NOT NULL THEN
    INSERT INTO target_metrics (product_id, name, key, value_type, display_order)
    VALUES
      (auto_id, 'ULP', 'ULP', 'COUNT', 1),
      (auto_id, 'Rapido', 'RAPIDO', 'COUNT', 2),
      (auto_id, 'FT', 'FT', 'COUNT', 3)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Tempo metrics (2 columns)
  IF tempo_id IS NOT NULL THEN
    INSERT INTO target_metrics (product_id, name, key, value_type, display_order)
    VALUES
      (tempo_id, 'ULP', 'ULP', 'COUNT', 1),
      (tempo_id, 'FT', 'FT', 'COUNT', 2)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
