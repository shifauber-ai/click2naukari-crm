/*
# Module 9-10 Correction: Manager CRUD on import_batches + import_records
# Module 12: Manager SELECT on profiles
# Module 11: Manager CRUD on payment_records for assigned products

Managers currently have SELECT-only on import_batches, import_records, payment_records, and no SELECT on profiles.
This adds the missing CRUD policies scoped to assigned products.
*/

-- ===== import_batches: Manager INSERT/UPDATE for assigned products =====
DROP POLICY IF EXISTS "import_batches_manager_insert" ON public.import_batches;
DROP POLICY IF EXISTS "import_batches_manager_update" ON public.import_batches;

CREATE POLICY "import_batches_manager_insert" ON public.import_batches
  FOR INSERT TO authenticated
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "import_batches_manager_update" ON public.import_batches
  FOR UPDATE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()))
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

-- ===== import_records: Manager INSERT/UPDATE for assigned products =====
DROP POLICY IF EXISTS "import_records_manager_insert" ON public.import_records;
DROP POLICY IF EXISTS "import_records_manager_update" ON public.import_records;

CREATE POLICY "import_records_manager_insert" ON public.import_records
  FOR INSERT TO authenticated
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "import_records_manager_update" ON public.import_records
  FOR UPDATE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()))
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

-- ===== payment_records: Manager INSERT/UPDATE/DELETE for assigned products =====
DROP POLICY IF EXISTS "pay_records_manager_insert" ON public.payment_records;
DROP POLICY IF EXISTS "pay_records_manager_update" ON public.payment_records;
DROP POLICY IF EXISTS "pay_records_manager_delete" ON public.payment_records;

CREATE POLICY "pay_records_manager_insert" ON public.payment_records
  FOR INSERT TO authenticated
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "pay_records_manager_update" ON public.payment_records
  FOR UPDATE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()))
  WITH CHECK (is_manager() AND product_id = ANY(assigned_product_ids()));

CREATE POLICY "pay_records_manager_delete" ON public.payment_records
  FOR DELETE TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- ===== profiles: Manager SELECT (needed for employee management) =====
DROP POLICY IF EXISTS "profiles_manager_select" ON public.profiles;
CREATE POLICY "profiles_manager_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (is_manager());

-- ===== profiles: Manager UPDATE (for employee activation/deactivation within product scope) =====
-- Manager can only update non-admin profiles
DROP POLICY IF EXISTS "profiles_manager_update" ON public.profiles;
CREATE POLICY "profiles_manager_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (is_manager() AND role IN ('EMPLOYEE', 'MANAGER'))
  WITH CHECK (is_manager() AND role IN ('EMPLOYEE', 'MANAGER'));
