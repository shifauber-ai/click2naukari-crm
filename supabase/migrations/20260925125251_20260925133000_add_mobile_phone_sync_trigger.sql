-- Add a trigger to sync mobile/mobile_display from phone when mobile is null on insert
-- This ensures backward compatibility with old schema queries that use mobile

CREATE OR REPLACE FUNCTION public.sync_mobile_from_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.mobile IS NULL AND NEW.phone IS NOT NULL THEN
    NEW.mobile := NEW.phone;
    NEW.mobile_display := COALESCE(NEW.mobile_display, NEW.phone);
  END IF;
  IF NEW.mobile_display IS NULL AND NEW.mobile IS NOT NULL THEN
    NEW.mobile_display := NEW.mobile;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mobile_from_phone ON public.leads;
CREATE TRIGGER trg_sync_mobile_from_phone
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_mobile_from_phone();