/*
# Add unique constraint on directory_entries.lead_id

Allows upsert with onConflict: lead_id to skip duplicates when bulk-saving leads to directory.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dir_entries_lead_unique'
  ) THEN
    ALTER TABLE directory_entries ADD CONSTRAINT dir_entries_lead_unique UNIQUE (lead_id);
  END IF;
END $$;
