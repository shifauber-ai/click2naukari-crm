/*
# Add MANAGER role, product assignments, and manager-scoped RLS

## Overview
This migration introduces the MANAGER role and product-based access control.
Managers are assigned to one or more products by an Admin and have full
read/write access to data within their assigned products only.

## Changes

### 1. CHECK constraint on profiles.role
- Adds a CHECK constraint so role must be one of: ADMIN, MANAGER, EMPLOYEE
- Existing data is compatible (all current rows are ADMIN or EMPLOYEE)

### 2. New table: manager_product_assignments
- Links a manager (profile) to products they can access
- Columns: id, manager_id (→ profiles.id), product_id (→ products.id), created_at
- Unique constraint on (manager_id, product_id) to prevent duplicates

### 3. New helper functions
- is_manager(): returns true if auth.uid() has role='MANAGER' and is_active
- has_product_access(p_product_id uuid): returns true if the current user
  is an admin (full access) OR is a manager assigned to that product
- assigned_product_ids(): returns an array of product IDs the current user
  can access (all products for admin, assigned products for manager,
  empty for employee)

### 4. RLS on manager_product_assignments
- Admins: full CRUD
- Managers: can read their own assignments only (cannot self-assign)

### 5. Updated RLS policies on product-scoped tables
For each table with a product_id column (leads, caller_queues, issues,
other_hero_leads, hero_ids, sims, lead_assignments, lead_status_history,
scheduled_transitions, product_cities, directory_entries, call_history,
payment_records), add a new SELECT policy:
  "<table>_manager_select" allowing managers to SELECT rows where
  product_id is in their assigned set.

Existing admin and employee policies are preserved. The new manager
policy is additive — it grants managers SELECT access to rows in their
assigned products that they couldn't see before.

For UPDATE/INSERT/DELETE on these tables, managers currently remain
restricted to admin-only. This can be expanded later when manager
mutation pages are built.

## Security
- manager_product_assignments has RLS enabled
- Managers cannot modify their own assignments
- Product access is enforced at the database level, not just the frontend
- The has_product_access() function is SECURITY DEFINER so it can read
  profiles and manager_product_assignments regardless of caller RLS
*/

-- 1. Add CHECK constraint on profiles.role
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'manager', 'employee'));
  END IF;
END $$;

-- 2. Create manager_product_assignments table
CREATE TABLE IF NOT EXISTS public.manager_product_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(manager_id, product_id)
);

ALTER TABLE public.manager_product_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "mgr_pa_admin_select" ON public.manager_product_assignments;
DROP POLICY IF EXISTS "mgr_pa_admin_insert" ON public.manager_product_assignments;
DROP POLICY IF EXISTS "mgr_pa_admin_update" ON public.manager_product_assignments;
DROP POLICY IF EXISTS "mgr_pa_admin_delete" ON public.manager_product_assignments;
DROP POLICY IF EXISTS "mgr_pa_manager_select_own" ON public.manager_product_assignments;

CREATE POLICY "mgr_pa_admin_select" ON public.manager_product_assignments
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "mgr_pa_admin_insert" ON public.manager_product_assignments
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "mgr_pa_admin_update" ON public.manager_product_assignments
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "mgr_pa_admin_delete" ON public.manager_product_assignments
  FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY "mgr_pa_manager_select_own" ON public.manager_product_assignments
  FOR SELECT TO authenticated USING (auth.uid() = manager_id);

-- 3. Helper functions
CREATE OR REPLACE FUNCTION public.is_manager()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'manager' AND is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_product_access(p_product_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT is_admin()
  OR (
    is_manager()
    AND EXISTS (
      SELECT 1 FROM public.manager_product_assignments
      WHERE manager_id = auth.uid() AND product_id = p_product_id
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assigned_product_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN is_admin() THEN ARRAY(SELECT id FROM public.products)
      WHEN is_manager() THEN
        ARRAY(
          SELECT product_id FROM public.manager_product_assignments
          WHERE manager_id = auth.uid()
        )
      ELSE ARRAY[]::uuid[]
    END;
$function$;

-- 4. Add manager SELECT policies to product-scoped tables
-- These are additive — existing admin/employee policies remain intact.

-- leads
DROP POLICY IF EXISTS "leads_manager_select" ON public.leads;
CREATE POLICY "leads_manager_select" ON public.leads
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- caller_queues
DROP POLICY IF EXISTS "caller_queues_manager_select" ON public.caller_queues;
CREATE POLICY "caller_queues_manager_select" ON public.caller_queues
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- issues
DROP POLICY IF EXISTS "issues_manager_select" ON public.issues;
CREATE POLICY "issues_manager_select" ON public.issues
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- other_hero_leads
DROP POLICY IF EXISTS "other_hero_manager_select" ON public.other_hero_leads;
CREATE POLICY "other_hero_manager_select" ON public.other_hero_leads
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- hero_ids
DROP POLICY IF EXISTS "hero_ids_manager_select" ON public.hero_ids;
CREATE POLICY "hero_ids_manager_select" ON public.hero_ids
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- sims
DROP POLICY IF EXISTS "sims_manager_select" ON public.sims;
CREATE POLICY "sims_manager_select" ON public.sims
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- lead_assignments
DROP POLICY IF EXISTS "lead_assignments_manager_select" ON public.lead_assignments;
CREATE POLICY "lead_assignments_manager_select" ON public.lead_assignments
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- lead_status_history
DROP POLICY IF EXISTS "lead_status_history_manager_select" ON public.lead_status_history;
CREATE POLICY "lead_status_history_manager_select" ON public.lead_status_history
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- scheduled_transitions
DROP POLICY IF EXISTS "scheduled_transitions_manager_select" ON public.scheduled_transitions;
CREATE POLICY "scheduled_transitions_manager_select" ON public.scheduled_transitions
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- product_cities
DROP POLICY IF EXISTS "product_cities_manager_select" ON public.product_cities;
CREATE POLICY "product_cities_manager_select" ON public.product_cities
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- directory_entries
DROP POLICY IF EXISTS "dir_entries_manager_select" ON public.directory_entries;
CREATE POLICY "dir_entries_manager_select" ON public.directory_entries
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- call_history
DROP POLICY IF EXISTS "callhist_manager_select" ON public.call_history;
CREATE POLICY "callhist_manager_select" ON public.call_history
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- payment_records
DROP POLICY IF EXISTS "payment_records_manager_select" ON public.payment_records;
CREATE POLICY "payment_records_manager_select" ON public.payment_records
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- 5. Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_mgr_pa_manager ON public.manager_product_assignments(manager_id);
CREATE INDEX IF NOT EXISTS idx_mgr_pa_product ON public.manager_product_assignments(product_id);
