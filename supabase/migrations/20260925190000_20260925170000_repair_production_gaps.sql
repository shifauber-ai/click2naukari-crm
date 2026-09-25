/*
# Repair Production Gaps — Multi-City Constraint, HC Target Metrics, QR Storage

## Purpose
Close 3 confirmed production gaps identified by the Phase 5 read-only audit
without reintroducing any obsolete OLD-schema functions or architecture.

## 1. Multi-city caller queue unique constraint
Production still has UNIQUE(product_id, employee_id) which blocks assigning
the same caller to multiple cities for the same product. Replace with a
city-aware unique index. No data is lost; no functions are touched.

## 2. HC target metrics seed
The target_metrics table is empty in production. Seed the two HC metrics
(Tag Added, Tag Form) that the HC reports tab depends on. Idempotent.

## 3. QR-codes storage bucket + policies
The qr-codes storage bucket and its policies are missing in production.
The frontend QR tab needs this bucket for image upload/display.

## Safety
- No obsolete functions (assign_new_lead, rotate_to_next_caller,
  write_audit_log, etc.) are recreated.
- No existing data is modified or deleted.
- All operations are idempotent.
- leads.last_trip_date type is NOT changed.
*/

-- ============================================================
-- 1. Multi-city caller queue unique constraint
-- ============================================================

ALTER TABLE public.caller_queues
  DROP CONSTRAINT IF EXISTS caller_queues_product_id_employee_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS caller_queues_product_employee_city_uniq
  ON public.caller_queues (
    product_id,
    employee_id,
    COALESCE(city_id, '00000000-0000-0000-0000-000000000000')
  );

-- ============================================================
-- 2. HC target metrics seed
-- ============================================================

INSERT INTO target_metrics (product_id, name, key, value_type, display_order, is_active)
SELECT p.id, 'Tag Added', 'TAG_ADDED', 'COUNT', 1, true
FROM public.products p
WHERE p.slug = 'hc'
  AND NOT EXISTS (
    SELECT 1 FROM target_metrics tm
    WHERE tm.product_id = p.id AND tm.key = 'TAG_ADDED'
  );

INSERT INTO target_metrics (product_id, name, key, value_type, display_order, is_active)
SELECT p.id, 'Tag Form', 'TAG_FORM', 'COUNT', 2, true
FROM public.products p
WHERE p.slug = 'hc'
  AND NOT EXISTS (
    SELECT 1 FROM target_metrics tm
    WHERE tm.product_id = p.id AND tm.key = 'TAG_FORM'
  );

-- ============================================================
-- 3. QR-codes storage bucket + policies
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "qr_codes_admin_upload" ON storage.objects;
CREATE POLICY "qr_codes_admin_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_public_read" ON storage.objects;
CREATE POLICY "qr_codes_public_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_admin_update" ON storage.objects;
CREATE POLICY "qr_codes_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND bucket_id = 'qr-codes')
  WITH CHECK (public.is_admin() AND bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_admin_delete" ON storage.objects;
CREATE POLICY "qr_codes_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (public.is_admin() AND bucket_id = 'qr-codes');
