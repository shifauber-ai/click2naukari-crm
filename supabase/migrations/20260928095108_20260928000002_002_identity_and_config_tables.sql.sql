/*
# 002 — Identity and Configuration Tables

## Purpose
Creates (or ensures existence of) all identity and product-configuration tables required by the CRM frontend.

## Tables

### profiles
- Links to auth.users via id (uuid PK)
- Fields: id, email, full_name, phone, role (app_role enum: admin/manager/employee), is_active, created_by, last_login_at, created_at, updated_at

### products
- Fields: id, name, code, slug, is_active, is_standard, has_payments, has_caller_queue, has_platforms_management, has_reports, has_employees_management, has_whatsapp, sort_order, created_at, updated_at

### platforms
- Fields: id, slug, name, is_active, created_by, created_at, updated_at

### product_cities
- Fields: id, product_id (FK products), city_name, is_active, created_at, updated_at

### product_platforms
- Fields: id, product_id (FK products), platform_id (FK platforms), is_active, sort_order, created_at

### caller_queues
- Fields: id, product_id (FK products), employee_id (FK profiles), priority, is_active, city_id (FK product_cities), created_at, updated_at

### caller_devices
- Fields: id, employee_id (FK profiles), device_name, device_identifier, phone_number, is_active, last_sync_at, created_at, updated_at

### employee_product_cities
- Fields: id, employee_id (FK profiles), product_id (FK products), city_id (FK product_cities), is_active, created_at

### manager_product_assignments
- Fields: id, manager_id (FK profiles), product_id (FK products), created_at

### Foreign Keys
- product_cities.product_id → products(id) ON DELETE CASCADE
- product_platforms.product_id → products(id) ON DELETE CASCADE
- product_platforms.platform_id → platforms(id) ON DELETE CASCADE
- caller_queues.product_id → products(id) ON DELETE CASCADE
- caller_queues.employee_id → profiles(id) ON DELETE CASCADE
- caller_queues.city_id → product_cities(id) ON DELETE SET NULL
- caller_devices.employee_id → profiles(id) ON DELETE CASCADE
- employee_product_cities.employee_id → profiles(id) ON DELETE CASCADE
- employee_product_cities.product_id → products(id) ON DELETE CASCADE
- employee_product_cities.city_id → product_cities(id) ON DELETE CASCADE
- manager_product_assignments.manager_id → profiles(id) ON DELETE CASCADE
- manager_product_assignments.product_id → products(id) ON DELETE CASCADE

### Notes
- All statements use IF NOT EXISTS so they are safe on live DB (no-op) and fresh DB (creates)
- The app_role enum type is created if not exists with values: admin, manager, employee
- Unique constraints added for: product_cities(product_id, city_name), product_platforms(product_id, platform_id), caller_queues(product_id, employee_id), employee_product_cities(employee_id, product_id, city_id), manager_product_assignments(manager_id, product_id)
*/

-- Ensure app_role enum type exists
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'manager', 'employee');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- === profiles ===
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text DEFAULT '',
  phone text DEFAULT '',
  role app_role NOT NULL DEFAULT 'employee',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role app_role NOT NULL DEFAULT 'employee';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === products ===
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  slug text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  is_standard boolean NOT NULL DEFAULT true,
  has_payments boolean NOT NULL DEFAULT false,
  has_caller_queue boolean NOT NULL DEFAULT false,
  has_platforms_management boolean NOT NULL DEFAULT false,
  has_reports boolean NOT NULL DEFAULT false,
  has_employees_management boolean NOT NULL DEFAULT false,
  has_whatsapp boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_standard boolean NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_payments boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_caller_queue boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_platforms_management boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_reports boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_employees_management boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_whatsapp boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === platforms ===
CREATE TABLE IF NOT EXISTS public.platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.platforms ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === product_cities ===
CREATE TABLE IF NOT EXISTS public.product_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  city_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_cities ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.product_cities ADD COLUMN IF NOT EXISTS city_name text NOT NULL;
ALTER TABLE public.product_cities ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.product_cities ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.product_cities ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_cities_prod_city ON public.product_cities(product_id, city_name);

-- === product_platforms ===
CREATE TABLE IF NOT EXISTS public.product_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  platform_id uuid REFERENCES public.platforms(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_platforms ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.product_platforms ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.platforms(id) ON DELETE CASCADE;
ALTER TABLE public.product_platforms ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.product_platforms ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.product_platforms ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_platforms_prod_plat ON public.product_platforms(product_id, platform_id);

-- === caller_queues ===
CREATE TABLE IF NOT EXISTS public.caller_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  city_id uuid REFERENCES public.product_cities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.caller_queues ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.caller_queues ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.caller_queues ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE public.caller_queues ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.caller_queues ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.product_cities(id) ON DELETE SET NULL;
ALTER TABLE public.caller_queues ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.caller_queues ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_caller_queues_prod_emp ON public.caller_queues(product_id, employee_id);

-- === caller_devices ===
CREATE TABLE IF NOT EXISTS public.caller_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_name text NOT NULL DEFAULT '',
  device_identifier text NOT NULL DEFAULT '',
  phone_number text,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.caller_devices ADD COLUMN IF NOT EXISTS employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.caller_devices ADD COLUMN IF NOT EXISTS device_name text NOT NULL DEFAULT '';
ALTER TABLE public.caller_devices ADD COLUMN IF NOT EXISTS device_identifier text NOT NULL DEFAULT '';
ALTER TABLE public.caller_devices ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.caller_devices ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.caller_devices ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
ALTER TABLE public.caller_devices ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.caller_devices ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === employee_product_cities ===
CREATE TABLE IF NOT EXISTS public.employee_product_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  city_id uuid REFERENCES public.product_cities(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_product_cities ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.employee_product_cities ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.employee_product_cities ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.product_cities(id) ON DELETE CASCADE;
ALTER TABLE public.employee_product_cities ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.employee_product_cities ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_prod_cities_unique ON public.employee_product_cities(employee_id, product_id, city_id);

-- === manager_product_assignments ===
CREATE TABLE IF NOT EXISTS public.manager_product_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manager_product_assignments ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.manager_product_assignments ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.manager_product_assignments ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_mgr_prod_assign_unique ON public.manager_product_assignments(manager_id, product_id);
