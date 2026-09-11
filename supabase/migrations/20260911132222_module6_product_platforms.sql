/*
# Module 6: Product-Platform mapping junction table

The existing `platforms` table is a global master list (id, name, is_active).
This migration adds a junction table to control which platforms are available
for which products, with its own active/inactive flag per mapping.
*/

CREATE TABLE IF NOT EXISTS public.product_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One mapping per product-platform pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_platforms_unique
  ON public.product_platforms (product_id, platform_id);

CREATE INDEX IF NOT EXISTS idx_product_platforms_product
  ON public.product_platforms (product_id);

CREATE INDEX IF NOT EXISTS idx_product_platforms_platform
  ON public.product_platforms (platform_id);

ALTER TABLE public.product_platforms ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
DROP POLICY IF EXISTS "product_platforms_admin_select" ON public.product_platforms;
DROP POLICY IF EXISTS "product_platforms_admin_insert" ON public.product_platforms;
DROP POLICY IF EXISTS "product_platforms_admin_update" ON public.product_platforms;
DROP POLICY IF EXISTS "product_platforms_admin_delete" ON public.product_platforms;

CREATE POLICY "product_platforms_admin_select" ON public.product_platforms
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "product_platforms_admin_insert" ON public.product_platforms
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "product_platforms_admin_update" ON public.product_platforms
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "product_platforms_admin_delete" ON public.product_platforms
  FOR DELETE TO authenticated USING (is_admin());

-- Manager: SELECT only for assigned products
DROP POLICY IF EXISTS "product_platforms_manager_select" ON public.product_platforms;
CREATE POLICY "product_platforms_manager_select" ON public.product_platforms
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));
