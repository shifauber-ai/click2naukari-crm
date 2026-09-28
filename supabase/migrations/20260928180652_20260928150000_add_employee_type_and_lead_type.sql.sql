/*
# Add employee_type to employee_product_cities and lead_type to leads

1. Changes:
- Add `employee_type` (text, default 'ULP') to `employee_product_cities` — stores ULP or FT per employee+product+city assignment. Both = two rows.
- Add `lead_type` (text, default 'ULP') to `leads` — stores whether a lead belongs to ULP or FT workflow.
- Add unique constraint on employee_product_cities (employee_id, product_id, city_id, employee_type) to prevent duplicate type assignments.
- Backfill: set all existing employee_product_cities rows to 'ULP' and all existing leads to 'ULP'.
*/

-- Add employee_type to employee_product_cities
ALTER TABLE public.employee_product_cities 
ADD COLUMN IF NOT EXISTS employee_type text NOT NULL DEFAULT 'ULP';

-- Add lead_type to leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS lead_type text NOT NULL DEFAULT 'ULP';

-- Drop old constraint if exists then add unique constraint
DO $$ BEGIN
  ALTER TABLE public.employee_product_cities DROP CONSTRAINT IF EXISTS employee_product_cities_emp_prod_city_type_uk;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.employee_product_cities
ADD CONSTRAINT employee_product_cities_emp_prod_city_type_uk
UNIQUE (employee_id, product_id, city_id, employee_type);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON public.leads(lead_type);
CREATE INDEX IF NOT EXISTS idx_epc_employee_type ON public.employee_product_cities(employee_type);
