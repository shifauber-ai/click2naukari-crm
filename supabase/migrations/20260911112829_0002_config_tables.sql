-- ============================================================================
-- 0002_config_tables.sql
-- ============================================================================

create table products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_standard boolean not null default true,
  has_payments boolean not null default false,
  has_caller_queue boolean not null default true,
  has_platforms_management boolean not null default true,
  has_reports boolean not null default true,
  has_employees_management boolean not null default true,
  has_whatsapp boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();

create table platforms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_platforms_updated_at before update on platforms
  for each row execute function set_updated_at();

create table product_platforms (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  platform_id uuid not null references platforms(id) on delete cascade,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, platform_id)
);
create index idx_product_platforms_product on product_platforms(product_id);
create index idx_product_platforms_platform on product_platforms(platform_id);

create table statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  bucket text check (bucket in ('issues', 'other_hero', 'follow_up', 'id_done', 'closed_not_interested')),
  color text not null default 'slate',
  is_ringing boolean not null default false,
  is_default_for_new boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table platform_statuses (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  platform_id uuid not null references platforms(id) on delete cascade,
  status_id uuid not null references statuses(id) on delete cascade,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, platform_id, status_id)
);
create index idx_platform_statuses_lookup on platform_statuses(product_id, platform_id, is_active);
create index idx_platform_statuses_status on platform_statuses(status_id);

create table cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, state)
);
create trigger trg_cities_updated_at before update on cities
  for each row execute function set_updated_at();
create unique index uq_cities_name_null_state on cities(name) where state is null;

create table product_cities (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  city_id uuid not null references cities(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, city_id)
);
create index idx_product_cities_product on product_cities(product_id);
create index idx_product_cities_city on product_cities(city_id);

create table sources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);
create index idx_sources_product on sources(product_id);
create unique index uq_sources_global_name on sources(name) where product_id is null;
create trigger trg_sources_updated_at before update on sources
  for each row execute function set_updated_at();