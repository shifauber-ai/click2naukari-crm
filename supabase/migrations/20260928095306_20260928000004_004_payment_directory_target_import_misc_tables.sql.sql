/*
# 004 — Payment, Directory, Target, Import, Audit, and Misc Tables

## Purpose
Creates (or ensures existence of) all remaining CRM tables required by the frontend.

## Tables

### payment_records
- id, lead_id, product_id, candidate_name, amount, payment_status, payment_method, payment_mode, service_description, qr_id, collected_by, employee_id, payment_date, remarks, transaction_id, created_at, updated_at

### car_qr_codes
- id, product_id, qr_name, qr_image_url, is_active, created_by, created_at, updated_at

### directory_entries
- id, product_id, name, phone_number, platform, city, status, label_id, candidate_name, employee_id, created_at, updated_at

### directory_labels
- id, name, created_at

### employee_targets
- id, employee_id, product_id, city_id, target_type, target_metric_id, target_value, period_type, start_date, end_date, is_active, created_by, created_at

### target_metrics
- id, product_id, name, key, value_type, display_order, is_active, created_by, created_at

### import_batches
- id, product_id, source, total_rows, status, total_imported, file_name, created_by, created_at, platform, target, directory_id, platform_id, source_id, file_type, imported_by, valid_rows, imported_rows, duplicate_in_file_rows, existing_rows, failed_rows, imported_at, completed_at

### import_records
- id, batch_id, row_data, status, error, lead_id, existing_lead_id, created_at

### audit_logs
- id, user_id, action, entity, entity_id, metadata, ip_address, created_at

### whatsapp_accounts
- id, employee_id, whatsapp_number, connection_status, integration_status, last_connected, is_active, created_at, updated_at

### sims
- id, sim_code, mobile_number, employee_id, product_id, status, assigned_date, released_date, notes, created_at, updated_at

### hero_ids
- id, hero_code, product_id, employee_id, status, created_at, updated_at

### Foreign Keys
- payment_records.lead_id → leads(id) ON DELETE SET NULL
- payment_records.product_id → products(id) ON DELETE CASCADE
- payment_records.employee_id → profiles(id) ON DELETE SET NULL
- payment_records.qr_id → car_qr_codes(id) ON DELETE SET NULL
- payment_records.collected_by → profiles(id) ON DELETE SET NULL
- car_qr_codes.product_id → products(id) ON DELETE CASCADE
- car_qr_codes.created_by → profiles(id) ON DELETE SET NULL
- directory_entries.product_id → products(id) ON DELETE CASCADE
- directory_entries.employee_id → profiles(id) ON DELETE SET NULL
- directory_entries.label_id → directory_labels(id) ON DELETE SET NULL
- employee_targets.employee_id → profiles(id) ON DELETE CASCADE
- employee_targets.product_id → products(id) ON DELETE CASCADE
- employee_targets.city_id → product_cities(id) ON DELETE SET NULL
- employee_targets.target_metric_id → target_metrics(id) ON DELETE SET NULL
- employee_targets.created_by → profiles(id) ON DELETE SET NULL
- target_metrics.product_id → products(id) ON DELETE CASCADE
- target_metrics.created_by → profiles(id) ON DELETE SET NULL
- import_batches.product_id → products(id) ON DELETE CASCADE
- import_batches.created_by → profiles(id) ON DELETE SET NULL
- import_records.batch_id → import_batches(id) ON DELETE CASCADE
- import_records.lead_id → leads(id) ON DELETE SET NULL
- import_records.existing_lead_id → leads(id) ON DELETE SET NULL
- audit_logs.user_id → profiles(id) ON DELETE SET NULL
- whatsapp_accounts.employee_id → profiles(id) ON DELETE CASCADE
- sims.employee_id → profiles(id) ON DELETE SET NULL
- sims.product_id → products(id) ON DELETE CASCADE
- hero_ids.product_id → products(id) ON DELETE CASCADE
- hero_ids.employee_id → profiles(id) ON DELETE SET NULL
*/

-- === payment_records ===
CREATE TABLE IF NOT EXISTS public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  candidate_name text DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'PENDING',
  payment_method text DEFAULT '',
  payment_mode text DEFAULT '',
  service_description text DEFAULT '',
  qr_id uuid REFERENCES public.car_qr_codes(id) ON DELETE SET NULL,
  collected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_date timestamptz DEFAULT now(),
  remarks text DEFAULT '',
  transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS candidate_name text DEFAULT '';
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS payment_method text DEFAULT '';
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT '';
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS service_description text DEFAULT '';
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS qr_id uuid REFERENCES public.car_qr_codes(id) ON DELETE SET NULL;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS collected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS payment_date timestamptz DEFAULT now();
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === car_qr_codes ===
CREATE TABLE IF NOT EXISTS public.car_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  qr_name text NOT NULL DEFAULT '',
  qr_image_url text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.car_qr_codes ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.car_qr_codes ADD COLUMN IF NOT EXISTS qr_name text NOT NULL DEFAULT '';
ALTER TABLE public.car_qr_codes ADD COLUMN IF NOT EXISTS qr_image_url text DEFAULT '';
ALTER TABLE public.car_qr_codes ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.car_qr_codes ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.car_qr_codes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.car_qr_codes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === directory_labels ===
CREATE TABLE IF NOT EXISTS public.directory_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.directory_labels ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.directory_labels ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- === directory_entries ===
CREATE TABLE IF NOT EXISTS public.directory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text DEFAULT '',
  phone_number text DEFAULT '',
  platform text DEFAULT '',
  city text DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE',
  label_id uuid REFERENCES public.directory_labels(id) ON DELETE SET NULL,
  candidate_name text DEFAULT '',
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS name text DEFAULT '';
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS phone_number text DEFAULT '';
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS platform text DEFAULT '';
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS city text DEFAULT '';
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS label_id uuid REFERENCES public.directory_labels(id) ON DELETE SET NULL;
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS candidate_name text DEFAULT '';
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === target_metrics ===
CREATE TABLE IF NOT EXISTS public.target_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  key text NOT NULL,
  value_type text NOT NULL DEFAULT 'COUNT',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.target_metrics ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.target_metrics ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.target_metrics ADD COLUMN IF NOT EXISTS key text NOT NULL;
ALTER TABLE public.target_metrics ADD COLUMN IF NOT EXISTS value_type text NOT NULL DEFAULT 'COUNT';
ALTER TABLE public.target_metrics ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.target_metrics ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.target_metrics ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.target_metrics ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- === employee_targets ===
CREATE TABLE IF NOT EXISTS public.employee_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  city_id uuid REFERENCES public.product_cities(id) ON DELETE SET NULL,
  target_type text NOT NULL DEFAULT 'INDIVIDUAL',
  target_metric_id uuid REFERENCES public.target_metrics(id) ON DELETE SET NULL,
  target_value numeric(12,2) NOT NULL DEFAULT 0,
  period_type text NOT NULL DEFAULT 'MONTHLY',
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.product_cities(id) ON DELETE SET NULL;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS target_metric_id uuid REFERENCES public.target_metrics(id) ON DELETE SET NULL;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS target_value numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS start_date date NOT NULL;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS end_date date NOT NULL;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.employee_targets ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- === import_batches ===
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  source text DEFAULT '',
  total_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  total_imported integer NOT NULL DEFAULT 0,
  file_name text DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  platform text DEFAULT '',
  target text DEFAULT '',
  directory_id uuid,
  platform_id uuid,
  source_id uuid,
  file_type text DEFAULT 'CSV',
  imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  valid_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  duplicate_in_file_rows integer NOT NULL DEFAULT 0,
  existing_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  imported_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS source text DEFAULT '';
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS total_rows integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS total_imported integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS file_name text DEFAULT '';
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS platform text DEFAULT '';
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS target text DEFAULT '';
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS directory_id uuid;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS platform_id uuid;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS file_type text DEFAULT 'CSV';
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS valid_rows integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS imported_rows integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS duplicate_in_file_rows integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS existing_rows integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS failed_rows integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS imported_at timestamptz;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- === import_records ===
CREATE TABLE IF NOT EXISTS public.import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_data jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  error text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  existing_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_records ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.import_batches(id) ON DELETE CASCADE;
ALTER TABLE public.import_records ADD COLUMN IF NOT EXISTS row_data jsonb;
ALTER TABLE public.import_records ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.import_records ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE public.import_records ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.import_records ADD COLUMN IF NOT EXISTS existing_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.import_records ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- === audit_logs ===
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text DEFAULT '',
  entity_id uuid,
  metadata jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text NOT NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity text DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- === whatsapp_accounts ===
CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  whatsapp_number text DEFAULT '',
  connection_status text DEFAULT 'DISCONNECTED',
  integration_status text DEFAULT 'PENDING',
  last_connected timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS whatsapp_number text DEFAULT '';
ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS connection_status text DEFAULT 'DISCONNECTED';
ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS integration_status text DEFAULT 'PENDING';
ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS last_connected timestamptz;
ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === sims ===
CREATE TABLE IF NOT EXISTS public.sims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_code text DEFAULT '',
  mobile_number text DEFAULT '',
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'AVAILABLE',
  assigned_date timestamptz,
  released_date timestamptz,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS sim_code text DEFAULT '';
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS mobile_number text DEFAULT '';
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS assigned_date timestamptz;
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS released_date timestamptz;
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.sims ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === hero_ids ===
CREATE TABLE IF NOT EXISTS public.hero_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_code text NOT NULL DEFAULT '',
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hero_ids ADD COLUMN IF NOT EXISTS hero_code text NOT NULL DEFAULT '';
ALTER TABLE public.hero_ids ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.hero_ids ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.hero_ids ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.hero_ids ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.hero_ids ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
