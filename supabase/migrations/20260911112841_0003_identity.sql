-- ============================================================================
-- 0003_identity.sql
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role app_role not null,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_profiles_role on profiles(role);
create index idx_profiles_is_active on profiles(is_active);
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

alter table platforms add constraint fk_platforms_created_by
  foreign key (created_by) references profiles(id);
alter table cities add constraint fk_cities_created_by
  foreign key (created_by) references profiles(id);
alter table sources add constraint fk_sources_created_by
  foreign key (created_by) references profiles(id);

create table managers (
  profile_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table manager_products (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references managers(profile_id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  can_manage_employees boolean not null default true,
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  unique (manager_id, product_id)
);
create index idx_manager_products_manager on manager_products(manager_id);
create index idx_manager_products_product on manager_products(product_id);

create table employees (
  profile_id uuid primary key references profiles(id) on delete cascade,
  employee_code text not null unique,
  created_at timestamptz not null default now()
);

create table employee_products (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(profile_id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  unique (employee_id, product_id)
);
create index idx_employee_products_employee on employee_products(employee_id);
create index idx_employee_products_product on employee_products(product_id);

create table employee_platforms (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(profile_id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  platform_id uuid not null references platforms(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (employee_id, product_id, platform_id)
);
create index idx_employee_platforms_employee on employee_platforms(employee_id);

create sequence employee_code_seq;
create or replace function next_employee_code()
returns text
language sql
as $$
  select 'EMP-' || lpad(nextval('employee_code_seq')::text, 6, '0');
$$;