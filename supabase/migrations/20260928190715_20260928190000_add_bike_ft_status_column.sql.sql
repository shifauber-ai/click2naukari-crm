/*
# Add bike_ft_status column to leads

Bike callers handle BOTH ULP and FT on the SAME lead.
When a Bike lead reaches Uber ID Done, an FT dropdown becomes available:
  Pending | Ringing | FT Done | Out of City | Trip Issue

This column stores that FT status independently from the lead's
platform status (uber_id_done) and lead status (status).
Only applies to Bike product leads.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'bike_ft_status'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN bike_ft_status text DEFAULT 'PENDING';
  END IF;
END $$;

-- Backfill: set bike_ft_status = 'PENDING' for existing Bike leads that are
-- already Uber ID Done but have no FT status yet.
UPDATE public.leads l
SET bike_ft_status = 'PENDING'
WHERE l.bike_ft_status IS NULL
  AND l.uber_id_done = true
  AND l.product_id IN (
    SELECT id FROM public.products
    WHERE UPPER(code) IN ('BIKE', 'MAINB001', 'B001', 'B002')
       OR LOWER(name) LIKE 'bike%'
  );
