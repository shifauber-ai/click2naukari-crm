-- Make mobile nullable on leads table — the app uses 'phone' as the primary field.
-- mobile is NOT NULL but the frontend never sets it (only sets phone).
-- This causes insert failures for direct lead creation (admin leads page, employee lead creation).
-- The bulk_import_leads RPC sets both, but direct inserts only set phone.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='leads' AND column_name='mobile' AND is_nullable = 'NO') THEN
    ALTER TABLE public.leads ALTER COLUMN mobile DROP NOT NULL;
  END IF;
END $$;

-- Also make mobile_display nullable for the same reason
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='leads' AND column_name='mobile_display' AND is_nullable = 'NO') THEN
    ALTER TABLE public.leads ALTER COLUMN mobile_display DROP NOT NULL;
  END IF;
END $$;