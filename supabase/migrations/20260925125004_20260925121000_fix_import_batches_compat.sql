/*
# Fix import_batches Compatibility Columns

## Purpose
The frontend import flow inserts columns that don't exist on `import_batches`:
`uploaded_by`, `existing_lead_duplicates`, `internal_duplicates`, `skipped`.
Also, the status CHECK constraint only allows 'processing/completed/failed' 
but the frontend sends 'PENDING' and 'COMPLETED'.

## Changes
1. Add columns: `uploaded_by`, `existing_lead_duplicates`, `internal_duplicates`, `skipped`
2. Drop the old status CHECK constraint and add a new one allowing: 
   'processing', 'completed', 'failed', 'PENDING', 'COMPLETED'
3. Add FK on `uploaded_by` → `profiles(id)`

## Security
- No RLS changes.
*/

-- Add missing columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='import_batches' AND column_name='uploaded_by') THEN
    ALTER TABLE public.import_batches ADD COLUMN uploaded_by uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='import_batches' AND column_name='existing_lead_duplicates') THEN
    ALTER TABLE public.import_batches ADD COLUMN existing_lead_duplicates integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='import_batches' AND column_name='internal_duplicates') THEN
    ALTER TABLE public.import_batches ADD COLUMN internal_duplicates integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='import_batches' AND column_name='skipped') THEN
    ALTER TABLE public.import_batches ADD COLUMN skipped integer DEFAULT 0;
  END IF;
END $$;

-- Add FK on uploaded_by
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'import_batches_uploaded_by_fkey') THEN
    ALTER TABLE public.import_batches 
    ADD CONSTRAINT import_batches_uploaded_by_fkey 
    FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);
  END IF;
END $$;

-- Fix status constraint: drop old, add new with frontend-compatible values
ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_status_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_status_check 
  CHECK (status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text, 'PENDING'::text, 'COMPLETED'::text]));