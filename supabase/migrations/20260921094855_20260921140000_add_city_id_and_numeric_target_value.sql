-- Add city_id column to employee_targets for city-wise targets
ALTER TABLE employee_targets ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES product_cities(id) ON DELETE SET NULL;

-- Change target_value from integer to numeric to support Ola Collection amounts
ALTER TABLE employee_targets ALTER COLUMN target_value TYPE numeric USING target_value::numeric;
ALTER TABLE employee_targets ALTER COLUMN target_value SET DEFAULT 0;

-- Make created_by nullable (auth.uid() default handles it, but some inserts may not set it)
ALTER TABLE employee_targets ALTER COLUMN created_by DROP NOT NULL;

-- Make end_date NOT NULL (we always store both start and end)
UPDATE employee_targets SET end_date = start_date WHERE end_date IS NULL;
ALTER TABLE employee_targets ALTER COLUMN end_date SET NOT NULL;
ALTER TABLE employee_targets ALTER COLUMN end_date SET DEFAULT CURRENT_DATE;

-- Drop old unique index and create new one with city_id
DROP INDEX IF EXISTS uniq_active_employee_target;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_employee_target
  ON employee_targets (employee_id, product_id, city_id, target_type, period_type, start_date)
  WHERE is_active = true;

-- Add index for city-filtered queries
CREATE INDEX IF NOT EXISTS idx_employee_targets_city ON employee_targets(city_id);
