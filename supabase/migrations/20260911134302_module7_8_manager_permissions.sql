/*
# Module 7+8: Manager CRUD permissions for product_platforms, product_cities, directory_entries
# Also: directory_labels read access for managers

Module 6 created product_platforms with manager SELECT-only. This migration
adds INSERT/UPDATE/DELETE for managers on their assigned products.
Same pattern applied to product_cities and directory_entries.
directory_labels gets manager SELECT access (labels are global, managers can read them).
*/

-- ===== product_platforms: Manager CRUD for assigned products =====
DROP POLICY IF EXISTS "product_platforms_manager_insert" ON public.product_platforms;
DROP POLICY IF EXISTS "product_platforms_manager_update" ON public.product_platforms;
DROP POLICY IF EXISTS "product_platforms_manager_delete" ON public.product_platforms;

CREATE POLICY "product_platforms_manager_insert" ON public.product_platforms
  FOR INSERT TO authenticated
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "product_platforms_manager_update" ON public.product_platforms
  FOR UPDATE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()))
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "product_platforms_manager_delete" ON public.product_platforms
  FOR DELETE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- ===== product_cities: Manager CRUD for assigned products =====
-- Currently manager has SELECT only. Add INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "product_cities_manager_insert" ON public.product_cities;
DROP POLICY IF EXISTS "product_cities_manager_update" ON public.product_cities;
DROP POLICY IF EXISTS "product_cities_manager_delete" ON public.product_cities;

CREATE POLICY "product_cities_manager_insert" ON public.product_cities
  FOR INSERT TO authenticated
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "product_cities_manager_update" ON public.product_cities
  FOR UPDATE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()))
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "product_cities_manager_delete" ON public.product_cities
  FOR DELETE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- ===== directory_entries: Manager CRUD for assigned products =====
-- Currently manager has SELECT only. Add INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "dir_entries_manager_insert" ON public.directory_entries;
DROP POLICY IF EXISTS "dir_entries_manager_update" ON public.directory_entries;
DROP POLICY IF EXISTS "dir_entries_manager_delete" ON public.directory_entries;

CREATE POLICY "dir_entries_manager_insert" ON public.directory_entries
  FOR INSERT TO authenticated
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "dir_entries_manager_update" ON public.directory_entries
  FOR UPDATE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()))
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "dir_entries_manager_delete" ON public.directory_entries
  FOR DELETE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- ===== directory_labels: Manager SELECT =====
-- Labels are global, but managers need to read them for directory entry forms.
DROP POLICY IF EXISTS "dir_labels_manager_select" ON public.directory_labels;
CREATE POLICY "dir_labels_manager_select" ON public.directory_labels
  FOR SELECT TO authenticated
  USING (is_manager());
