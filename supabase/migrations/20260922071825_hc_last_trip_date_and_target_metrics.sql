/*
# HC: Add last_trip_date column and seed HC target metrics

1. Schema Changes
   - Adds `last_trip_date` column (date, nullable) to `leads` table.
   - This column stores the Last Trip Date for HC imported leads.

2. Seed Data
   - Creates two target_metrics for the HC product (H001):
     - "Tag Added" (key: TAG_ADDED, value_type: COUNT)
     - "Tag Form" (key: TAG_FORM, value_type: COUNT)
   - These are the only target columns for HC — no ULP, FT, Rapido, Ola, etc.

3. Security
   - No RLS changes. Existing leads RLS policies cover the new column automatically.
   - No new tables created.
*/

-- Add last_trip_date column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'last_trip_date'
  ) THEN
    ALTER TABLE leads ADD COLUMN last_trip_date date;
  END IF;
END $$;

-- Seed HC target metrics (idempotent)
-- Use product code/slug lookup instead of hardcoded UUID for fresh-DB compatibility.
-- OLD schema uses code='H001', NEW schema uses slug='hc'; try both.
INSERT INTO target_metrics (product_id, name, key, value_type, display_order, is_active)
SELECT p.id, 'Tag Added', 'TAG_ADDED', 'COUNT', 1, true
FROM public.products p
WHERE (p.code = 'H001' OR p.slug = 'hc')
  AND NOT EXISTS (
    SELECT 1 FROM target_metrics tm
    WHERE tm.product_id = p.id AND tm.key = 'TAG_ADDED'
  );

INSERT INTO target_metrics (product_id, name, key, value_type, display_order, is_active)
SELECT p.id, 'Tag Form', 'TAG_FORM', 'COUNT', 2, true
FROM public.products p
WHERE (p.code = 'H001' OR p.slug = 'hc')
  AND NOT EXISTS (
    SELECT 1 FROM target_metrics tm
    WHERE tm.product_id = p.id AND tm.key = 'TAG_FORM'
  );
