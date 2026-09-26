/*
# Fix Role Helper Functions and Product Access

## Purpose
Rewrites the role-checking helper functions and has_product_access() to:
1. Remove dependencies on legacy tables (manager_products, employee_products).
2. Ensure current_role_name() safely bypasses RLS via SECURITY DEFINER.
3. Ensure is_admin(), is_manager(), is_employee() correctly compare against
   the app_role enum values (lowercase: 'admin', 'manager', 'employee').
4. Rewrite has_product_access() to use:
   - manager_product_assignments for manager product access
   - caller_queues for employee product access (active queue membership)

## Functions Changed
- current_role_name() — unchanged behavior, SECURITY DEFINER, returns app_role
- is_admin() — returns true when current_role_name() = 'admin'
- is_manager() — returns true when current_role_name() = 'manager'
- is_employee() — returns true when current_role_name() = 'employee'
- has_product_access(p_product_id uuid) — rewritten:
  - ADMIN: always true
  - MANAGER: true when manager_product_assignments has matching row
  - EMPLOYEE: true when caller_queues has active row for this employee+product

## Security
- current_role_name() remains SECURITY DEFINER with fixed search_path —
  bypasses RLS on profiles, preventing recursion.
- is_admin/is_manager/is_employee remain SECURITY INVOKER — they only call
  current_role_name() which is SECURITY DEFINER, so no recursion.
- has_product_access() remains SECURITY DEFINER with fixed search_path —
  it reads from manager_product_assignments and caller_queues without
  being blocked by their RLS policies.

## No Other Changes
- No tables created, altered, or dropped.
- No RLS policies changed.
- No frontend files changed.
- No data modified.
- app_role enum unchanged (lowercase values: 'admin', 'manager', 'employee').
- profiles.role column type unchanged (app_role enum).
- bootstrap_profile unchanged.
*/

-- ---------------------------------------------------------------------------
-- current_role_name(): returns the app_role enum value for auth.uid().
-- SECURITY DEFINER + fixed search_path ensures it bypasses RLS on profiles,
-- preventing infinite recursion when used inside RLS policies on profiles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  return (select role from profiles where id = auth.uid());
end;
$function$;

-- ---------------------------------------------------------------------------
-- is_admin(): true when the current authenticated user is an Admin.
-- SECURITY INVOKER is correct: it delegates to current_role_name() which
-- is SECURITY DEFINER and bypasses RLS. No recursion risk.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  select current_role_name() = 'admin';
$function$;

-- ---------------------------------------------------------------------------
-- is_manager(): true when the current authenticated user is a Manager.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  select current_role_name() = 'manager';
$function$;

-- ---------------------------------------------------------------------------
-- is_employee(): true when the current authenticated user is an Employee.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_employee()
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  select current_role_name() = 'employee';
$function$;

-- ---------------------------------------------------------------------------
-- has_product_access(p_product_id): checks whether the current authenticated
-- user has access to the specified product.
--
-- ADMIN:     always true.
-- MANAGER:   true when a row exists in manager_product_assignments with
--            manager_id = auth.uid() AND product_id = p_product_id.
-- EMPLOYEE:  true when a row exists in caller_queues with
--            employee_id = auth.uid() AND product_id = p_product_id
--            AND is_active = true.
--
-- SECURITY DEFINER + fixed search_path ensures this function can read
-- manager_product_assignments and caller_queues without being blocked
-- by their RLS policies, regardless of the caller's role.
--
-- No longer references legacy tables:
--   manager_products  (replaced by manager_product_assignments)
--   employee_products (replaced by caller_queues)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_product_access(p_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_role app_role := current_role_name();
begin
  if v_role is null then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if v_role = 'manager' then
    return exists (
      select 1 from manager_product_assignments
      where manager_id = auth.uid()
        and product_id = p_product_id
    );
  end if;

  if v_role = 'employee' then
    return exists (
      select 1 from caller_queues
      where employee_id = auth.uid()
        and product_id = p_product_id
        and is_active = true
    );
  end if;

  return false;
end;
$function$;
