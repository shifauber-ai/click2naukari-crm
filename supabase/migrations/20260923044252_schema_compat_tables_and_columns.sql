-- ============================================================
-- SCHEMA COMPATIBILITY LAYER — Part 1: Tables & Columns
-- ============================================================

-- ============ PRODUCTS: add 'code' column ============
ALTER TABLE products ADD COLUMN IF NOT EXISTS code text;
-- Populate code from slug for existing rows
UPDATE products SET code = slug WHERE code IS NULL AND slug IS NOT NULL;

-- ============ LEADS: add missing columns app expects ============
ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_caller_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status text DEFAULT 'NEW';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rotation_count int NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS in_admin_review boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vehicle_no text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dl_no text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS total_trips int;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS license_no text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_trip_date text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ringing_started_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS uber_id_done boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ola_id_done boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rapido_id_done boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_status text;

-- Sync data from existing normalized columns
UPDATE leads SET current_caller_id = assigned_caller_id WHERE current_caller_id IS NULL AND assigned_caller_id IS NOT NULL;
UPDATE leads SET phone = mobile WHERE phone IS NULL AND mobile IS NOT NULL;
UPDATE leads SET in_admin_review = needs_admin_review WHERE in_admin_review = false AND needs_admin_review = true;

-- ============ CALLER_QUEUES ============
CREATE TABLE IF NOT EXISTS caller_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  city_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, employee_id)
);
ALTER TABLE caller_queues ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_caller_queues_product_active ON caller_queues(product_id, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_caller_queues_employee ON caller_queues(employee_id, is_active);

-- ============ MANAGER_PRODUCT_ASSIGNMENTS ============
CREATE TABLE IF NOT EXISTS manager_product_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(manager_id, product_id)
);
ALTER TABLE manager_product_assignments ENABLE ROW LEVEL SECURITY;

-- ============ EMPLOYEE_PRODUCT_CITIES ============
CREATE TABLE IF NOT EXISTS employee_product_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  city_id uuid REFERENCES product_cities(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE employee_product_cities ENABLE ROW LEVEL SECURITY;

-- ============ OTHER_HERO_LEADS ============
CREATE TABLE IF NOT EXISTS other_hero_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE other_hero_leads ENABLE ROW LEVEL SECURITY;

-- ============ LEAD_PLATFORM_STATUS ============
CREATE TABLE IF NOT EXISTS lead_platform_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lead_platform_status ENABLE ROW LEVEL SECURITY;

-- ============ SCHEDULED_TRANSITIONS ============
CREATE TABLE IF NOT EXISTS scheduled_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  current_caller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  expected_status text NOT NULL,
  next_action_at timestamptz NOT NULL,
  transition_type text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempt_number int NOT NULL DEFAULT 1,
  error_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE scheduled_transitions ENABLE ROW LEVEL SECURITY;

-- ============ PAYMENT_RECORDS ============
CREATE TABLE IF NOT EXISTS payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  candidate_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'PENDING',
  payment_method text NOT NULL DEFAULT '',
  transaction_id text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  service_description text,
  payment_mode text,
  qr_id uuid,
  collected_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  payment_date date,
  payment_time text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- ============ CALL_HISTORY ============
CREATE TABLE IF NOT EXISTS call_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  caller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  phone_number text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'OUTGOING',
  call_status text NOT NULL DEFAULT '',
  duration_seconds int NOT NULL DEFAULT 0,
  outcome text,
  remarks text,
  is_simulated boolean NOT NULL DEFAULT false,
  call_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sync_source text,
  device_id text,
  external_call_id text,
  normalized_phone text,
  synced_at timestamptz
);
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_call_history_caller ON call_history(caller_id, call_timestamp);
CREATE INDEX IF NOT EXISTS idx_call_history_product ON call_history(product_id, call_timestamp);

-- ============ CALLER_DEVICES ============
CREATE TABLE IF NOT EXISTS caller_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_name text NOT NULL DEFAULT '',
  device_identifier text NOT NULL DEFAULT '',
  phone_number text,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE caller_devices ENABLE ROW LEVEL SECURITY;

-- ============ CAR_QR_CODES ============
CREATE TABLE IF NOT EXISTS car_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  city_id uuid REFERENCES product_cities(id) ON DELETE SET NULL,
  qr_code text NOT NULL DEFAULT '',
  upi_id text NOT NULL DEFAULT '',
  merchant_name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE car_qr_codes ENABLE ROW LEVEL SECURITY;

-- ============ IMPORT_RECORDS ============
CREATE TABLE IF NOT EXISTS import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number int NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  product_id uuid,
  platform text,
  city text,
  label text,
  status text NOT NULL DEFAULT 'PENDING',
  duplicate_type text NOT NULL DEFAULT 'NONE',
  existing_lead_id uuid,
  validation_error text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  existing_lead jsonb,
  import_batch_id uuid
);
ALTER TABLE import_records ENABLE ROW LEVEL SECURITY;

-- ============ DIRECTORY_ENTRIES ============
CREATE TABLE IF NOT EXISTS directory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  platform text,
  city text,
  status text NOT NULL DEFAULT 'ACTIVE',
  label_id uuid,
  candidate_name text NOT NULL DEFAULT '',
  phone_number text NOT NULL DEFAULT '',
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  remarks text NOT NULL DEFAULT '',
  saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  import_batch_id uuid,
  duplicate_type text DEFAULT 'NONE',
  existing_lead_id uuid
);
ALTER TABLE directory_entries ENABLE ROW LEVEL SECURITY;

-- ============ DIRECTORY_LABELS ============
CREATE TABLE IF NOT EXISTS directory_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT 'blue',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE directory_labels ENABLE ROW LEVEL SECURITY;

-- ============ SIMS ============
CREATE TABLE IF NOT EXISTS sims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_code text NOT NULL,
  mobile_number text NOT NULL DEFAULT '',
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'AVAILABLE',
  assigned_date timestamptz,
  released_date timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sims ENABLE ROW LEVEL SECURITY;

-- ============ WHATSAPP_ACCOUNTS ============
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  whatsapp_number text NOT NULL DEFAULT '',
  connection_status text NOT NULL DEFAULT 'PENDING',
  integration_status text NOT NULL DEFAULT 'PENDING',
  last_connected timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id)
);
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;

-- ============ TARGET_METRICS ============
CREATE TABLE IF NOT EXISTS target_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  key text NOT NULL,
  value_type text NOT NULL DEFAULT 'COUNT',
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE target_metrics ENABLE ROW LEVEL SECURITY;

-- ============ EMPLOYEE_TARGETS ============
CREATE TABLE IF NOT EXISTS employee_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  city_id uuid,
  target_type text NOT NULL,
  target_metric_id uuid REFERENCES target_metrics(id) ON DELETE SET NULL,
  target_value numeric NOT NULL DEFAULT 0,
  period_type text NOT NULL DEFAULT 'DAILY',
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE employee_targets ENABLE ROW LEVEL SECURITY;
