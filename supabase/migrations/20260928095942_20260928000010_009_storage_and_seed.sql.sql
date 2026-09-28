/*
# 009 — Storage Bucket and Reference Data Seed

## Storage
- Creates `qr-codes` bucket (public read)
- Sets up storage policies for authenticated admin/manager upload

## Reference Data
- Seeds platforms (Uber, Ola, Rapido, etc.)
- Does NOT seed fake leads/employees/payments

## Notes
- Bucket creation is idempotent (insert if not exists)
- Storage policies use drop-first pattern
*/

-- === Create qr-codes storage bucket ===
INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

-- === Storage policies for qr-codes bucket ===
DROP POLICY IF EXISTS "qr_codes_public_read" ON storage.objects;
CREATE POLICY "qr_codes_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_admin_upload" ON storage.objects;
CREATE POLICY "qr_codes_admin_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'qr-codes'
    AND (public.is_admin() OR public.is_manager())
  );

DROP POLICY IF EXISTS "qr_codes_admin_update" ON storage.objects;
CREATE POLICY "qr_codes_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'qr-codes'
    AND (public.is_admin() OR public.is_manager())
  )
  WITH CHECK (
    bucket_id = 'qr-codes'
    AND (public.is_admin() OR public.is_manager())
  );

DROP POLICY IF EXISTS "qr_codes_admin_delete" ON storage.objects;
CREATE POLICY "qr_codes_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'qr-codes'
    AND (public.is_admin() OR public.is_manager())
  );

-- === Seed reference data: platforms ===
INSERT INTO public.platforms (slug, name, is_active) VALUES
  ('uber', 'Uber', true),
  ('ola', 'Ola', true),
  ('rapido', 'Rapido', true),
  ('auto', 'Auto', true),
  ('bike', 'Bike', true),
  ('car', 'Car', true)
ON CONFLICT DO NOTHING;

-- === Seed reference data: products ===
-- Only seed if products table is empty
INSERT INTO public.products (name, code, slug, is_active, is_standard, has_payments, has_caller_queue, has_platforms_management, has_reports, has_employees_management, has_whatsapp, sort_order)
SELECT * FROM (VALUES
  ('Car', 'CAR', 'car', true, true, true, true, true, true, true, false, 1),
  ('Bike', 'BIKE', 'bike', true, true, true, true, true, true, true, false, 2),
  ('Auto', 'AUTO', 'auto', true, true, false, true, true, true, true, false, 3),
  ('Tempo', 'TEMPO', 'tempo', true, true, false, true, true, true, true, false, 4)
) AS t(name, code, slug, is_active, is_standard, has_payments, has_caller_queue, has_platforms_management, has_reports, has_employees_management, has_whatsapp, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.products LIMIT 1);

-- === Seed product-platform mappings ===
-- Only if no mappings exist
INSERT INTO public.product_platforms (product_id, platform_id, is_active, sort_order)
SELECT p.id, pl.id, true, 1
FROM public.products p
CROSS JOIN public.platforms pl
WHERE pl.slug IN ('uber', 'ola', 'rapido')
AND NOT EXISTS (SELECT 1 FROM public.product_platforms LIMIT 1);
