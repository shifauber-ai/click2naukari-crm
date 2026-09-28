/*
# 008 — Triggers and Automation

## Triggers

### updated_at triggers
- All tables with updated_at column get a BEFORE UPDATE trigger calling set_updated_at()
- Tables: profiles, products, platforms, product_cities, product_platforms, caller_queues,
  caller_devices, employee_product_cities, manager_product_assignments, leads, lead_platform_status,
  issues, other_hero_leads, payment_records, car_qr_codes, directory_entries, employee_targets,
  target_metrics, import_batches, import_records, whatsapp_accounts, sims, hero_ids

### Lead auto-assignment trigger
- AFTER INSERT ON leads → calls assign_new_lead() to auto-assign to next available caller
- Only triggers when current_caller_id IS NULL (new unassigned leads)

### Mobile/phone sync trigger
- BEFORE INSERT OR UPDATE ON leads → syncs mobile from phone if mobile is null

## Notes
- Uses DROP TRIGGER IF EXISTS + CREATE TRIGGER pattern for idempotency
- The lead auto-assignment trigger uses SECURITY DEFINER function to bypass RLS
*/

-- === updated_at triggers for all tables ===
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_platforms_updated_at ON public.platforms;
CREATE TRIGGER trg_platforms_updated_at BEFORE UPDATE ON public.platforms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_product_cities_updated_at ON public.product_cities;
CREATE TRIGGER trg_product_cities_updated_at BEFORE UPDATE ON public.product_cities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_product_platforms_updated_at ON public.product_platforms;
CREATE TRIGGER trg_product_platforms_updated_at BEFORE UPDATE ON public.product_platforms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_caller_queues_updated_at ON public.caller_queues;
CREATE TRIGGER trg_caller_queues_updated_at BEFORE UPDATE ON public.caller_queues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_caller_devices_updated_at ON public.caller_devices;
CREATE TRIGGER trg_caller_devices_updated_at BEFORE UPDATE ON public.caller_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lead_platform_status_updated_at ON public.lead_platform_status;
CREATE TRIGGER trg_lead_platform_status_updated_at BEFORE UPDATE ON public.lead_platform_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_issues_updated_at ON public.issues;
CREATE TRIGGER trg_issues_updated_at BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_other_hero_leads_updated_at ON public.other_hero_leads;
CREATE TRIGGER trg_other_hero_leads_updated_at BEFORE UPDATE ON public.other_hero_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payment_records_updated_at ON public.payment_records;
CREATE TRIGGER trg_payment_records_updated_at BEFORE UPDATE ON public.payment_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_car_qr_codes_updated_at ON public.car_qr_codes;
CREATE TRIGGER trg_car_qr_codes_updated_at BEFORE UPDATE ON public.car_qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_directory_entries_updated_at ON public.directory_entries;
CREATE TRIGGER trg_directory_entries_updated_at BEFORE UPDATE ON public.directory_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_employee_targets_updated_at ON public.employee_targets;
CREATE TRIGGER trg_employee_targets_updated_at BEFORE UPDATE ON public.employee_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_target_metrics_updated_at ON public.target_metrics;
CREATE TRIGGER trg_target_metrics_updated_at BEFORE UPDATE ON public.target_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_import_batches_updated_at ON public.import_batches;
CREATE TRIGGER trg_import_batches_updated_at BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_accounts_updated_at ON public.whatsapp_accounts;
CREATE TRIGGER trg_whatsapp_accounts_updated_at BEFORE UPDATE ON public.whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sims_updated_at ON public.sims;
CREATE TRIGGER trg_sims_updated_at BEFORE UPDATE ON public.sims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_hero_ids_updated_at ON public.hero_ids;
CREATE TRIGGER trg_hero_ids_updated_at BEFORE UPDATE ON public.hero_ids
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === Lead auto-assignment trigger function ===
CREATE OR REPLACE FUNCTION public.trigger_assign_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only auto-assign if no caller is set and the lead is active
  IF NEW.current_caller_id IS NULL AND NEW.is_active = true THEN
    PERFORM public.assign_new_lead(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_auto_assign ON public.leads;
CREATE TRIGGER trg_leads_auto_assign
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_assign_new_lead();

-- === Mobile/phone sync trigger function ===
CREATE OR REPLACE FUNCTION public.sync_mobile_from_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sync mobile from phone if mobile is null or empty
  IF (NEW.mobile IS NULL OR NEW.mobile = '') AND NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    NEW.mobile := NEW.phone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mobile_from_phone ON public.leads;
CREATE TRIGGER trg_sync_mobile_from_phone
  BEFORE INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.sync_mobile_from_phone();

-- === Lead code generation trigger ===
CREATE OR REPLACE FUNCTION public.generate_lead_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_code text;
BEGIN
  -- Generate a human-readable lead code if not set
  IF NEW.name IS NULL OR NEW.name = '' THEN
    SELECT code INTO v_product_code FROM public.products WHERE id = NEW.product_id;
    NEW.name := COALESCE(v_product_code, 'LD') || '-' || upper(substr(NEW.id::text, 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_set_code ON public.leads;
CREATE TRIGGER trg_leads_set_code
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.generate_lead_code();
