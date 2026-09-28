/*
# Fix: lead_code NOT NULL constraint blocking lead inserts

## Problem
The `leads.lead_code` column is NOT NULL with no default. The frontend insert
never sends a `lead_code` value, so every insert fails with a NOT NULL violation.

The `generate_lead_code()` trigger was overwriting `name` instead of setting `lead_code`.

## Fix
1. Alter `lead_code` to be nullable (frontend doesn't use it)
2. Fix `generate_lead_code()` trigger to set `lead_code` (not `name`) when it's null
3. Ensure `source` column exists on leads (frontend sends it in inserts)
*/

ALTER TABLE public.leads ALTER COLUMN lead_code DROP NOT NULL;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source text DEFAULT '';

CREATE OR REPLACE FUNCTION public.generate_lead_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_code text;
BEGIN
  IF NEW.lead_code IS NULL OR NEW.lead_code = '' THEN
    SELECT code INTO v_product_code FROM public.products WHERE id = NEW.product_id;
    NEW.lead_code := COALESCE(upper(v_product_code), 'LD') || '-' || upper(substr(NEW.id::text, 1, 8));
  END IF;
  RETURN NEW;
END;
$$;
