-- Add platform text column to import_batches (frontend inserts platform name, not platform_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='import_batches' AND column_name='platform') THEN
    ALTER TABLE public.import_batches ADD COLUMN platform text;
  END IF;
END $$;