-- Drop the broken trigger on import_batches (table has no updated_at column)
DROP TRIGGER IF EXISTS trg_import_batches_updated_at ON public.import_batches;

-- Add 'FAILED' to the allowed status values (frontend may use uppercase)
ALTER TABLE public.import_batches DROP CONSTRAINT import_batches_status_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_status_check 
  CHECK (status = ANY (ARRAY['processing', 'completed', 'failed', 'PENDING', 'COMPLETED', 'FAILED']));

-- Mark all stuck PENDING batches as FAILED
UPDATE public.import_batches 
SET status = 'FAILED'
WHERE status = 'PENDING' AND imported = 0;
