-- ============================================================================
-- 0001_extensions_and_helpers.sql
-- Extensions, the role enum, and the helper functions every RLS policy and
-- trigger in later migrations builds on. Keeping these first and stable
-- means later migrations never redefine them.
-- ============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pg_cron;       -- server-side scheduling (ringing rotation, retention)
create extension if not exists pg_net;        -- optional: let SQL call out to an Edge Function via HTTP
create extension if not exists "uuid-ossp";   -- uuid_generate_v4() fallback, some client libs expect it

-- ----------------------------------------------------------------------------
-- Roles. Exactly three, per spec.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'manager', 'employee');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- updated_at housekeeping, reused by every table below that has the column.
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Identity helpers used throughout RLS policies and server-side code.
-- ----------------------------------------------------------------------------

create or replace function current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- language plpgsql (not sql) is deliberate: a `language sql` body is parsed
-- and validated against the catalog at CREATE FUNCTION time, which would
-- fail here since `profiles` doesn't exist until migration 0003 — plpgsql
-- only syntax-checks at creation and resolves table references at first
-- call, long after every migration has run.
create or replace function current_role_name()
returns app_role
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select role from profiles where id = auth.uid());
end;
$$;

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select current_role_name() = 'admin';
$$;

create or replace function is_manager()
returns boolean
language sql
stable
as $$
  select current_role_name() = 'manager';
$$;

create or replace function is_employee()
returns boolean
language sql
stable
as $$
  select current_role_name() = 'employee';
$$;

-- Does the signed-in user (any role) have access to this product?
create or replace function has_product_access(p_product_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
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
      select 1 from manager_products mp
      where mp.manager_id = auth.uid() and mp.product_id = p_product_id
    );
  end if;

  if v_role = 'employee' then
    return exists (
      select 1 from employee_products ep
      where ep.employee_id = auth.uid() and ep.product_id = p_product_id
    );
  end if;

  return false;
end;
$$;

comment on function has_product_access(uuid) is
  'Single source of truth for "can this signed-in user touch this product''s data" — used by RLS policies on every product-scoped table and by requireProductAccess() server-side.';