/*
# Add form_status column to leads table for HC Form tracking

1. Changes
- Adds `form_status` column (text, NOT NULL, default 'PENDING') to the `leads` table.
- This column tracks the HC "Form" state independently from the lead's Status.
- Allowed values: 'PENDING', 'TAG_FORM'.
- Existing leads default to 'PENDING' via the column default.
- New imported HC leads will automatically get 'PENDING' since the column defaults to it.

2. Security
- No RLS policy changes — the column is accessible under existing lead policies.
- No new tables created.
- Existing lead statuses (Tag Added, Ringing, etc.) remain unchanged.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND table_schema = 'public' AND column_name = 'form_status'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN form_status text NOT NULL DEFAULT 'PENDING';
  END IF;
END $$;
