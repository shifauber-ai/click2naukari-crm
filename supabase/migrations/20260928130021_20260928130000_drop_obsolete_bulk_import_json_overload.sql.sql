-- Drop the obsolete json overload of bulk_import_leads
-- Only the jsonb version should exist to avoid PostgREST ambiguity
DROP FUNCTION IF EXISTS public.bulk_import_leads(p_leads json);
