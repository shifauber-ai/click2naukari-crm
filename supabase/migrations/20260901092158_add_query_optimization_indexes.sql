-- Indexes for employee-scoped date-range queries (reports & dashboard).
CREATE INDEX IF NOT EXISTS idx_statushist_employee_created
  ON lead_status_history(employee_id, created_at);

CREATE INDEX IF NOT EXISTS idx_issues_employee_created
  ON issues(employee_id, created_at);

CREATE INDEX IF NOT EXISTS idx_otherhero_employee
  ON other_hero_leads(employee_id);

-- Composite index for import dedup lookup.
CREATE INDEX IF NOT EXISTS idx_leads_product_phone
  ON leads(product_id, phone);
