-- Drop the old 3-param overload so only the 4-param version (with p_remarks) is used
DROP FUNCTION IF EXISTS public.update_lead_platform_status(uuid, text, text);
