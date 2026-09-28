/*
# 001 — Core Extensions and Helper Functions

## Purpose
Establishes the foundational database extensions and helper functions needed by the CRM backend.

## Changes

### Extensions
- `pgcrypto` — for gen_random_uuid()

### Helper Functions
1. `set_updated_at()` — trigger function that updates the `updated_at` column to now()
2. `is_admin()` — returns true if the current authenticated user has role 'admin'
3. `is_manager()` — returns true if the current authenticated user has role 'manager'
4. `current_profile_id()` — returns the profile id (uuid) of the current authenticated user
5. `is_manager_of_product(p_product_id)` — checks if current user manages a product (or is admin)
6. `is_employee_of_product(p_product_id)` — checks if current user is assigned to a product
7. `employee_product_ids()` — returns product_ids for current employee
8. `manager_product_ids()` — returns product_ids for current manager

### Notes
- Role column is enum type `app_role` with values: admin, manager, employee (lowercase)
- Helper functions use SECURITY DEFINER so they work in RLS policies
- set_updated_at is a standard trigger function used by all tables with updated_at
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role::text = 'admin'
    AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role::text = 'manager'
    AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_manager_of_product(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.manager_product_assignments mpa
    WHERE mpa.manager_id = auth.uid()
    AND mpa.product_id = p_product_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_employee_of_product(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.caller_queues cq
    WHERE cq.employee_id = auth.uid()
    AND cq.product_id = p_product_id
    AND cq.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.employee_product_ids()
RETURNS TABLE(product_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT cq.product_id FROM public.caller_queues cq
  WHERE cq.employee_id = auth.uid() AND cq.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.manager_product_ids()
RETURNS TABLE(product_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT mpa.product_id FROM public.manager_product_assignments mpa
  WHERE mpa.manager_id = auth.uid();
$$;
