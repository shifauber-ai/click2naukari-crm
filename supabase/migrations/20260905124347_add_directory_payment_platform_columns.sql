/*
# Add Directory, Payment, Platform/City columns

## Purpose
Adds platform and city columns to leads for filtering, creates directory entries
table for saving important leads, directory labels for configurable labeling,
payment merchants for Razorpay configuration, and payment records for tracking
collections.

## New Columns on existing tables
- leads.platform (text, nullable) — source platform (e.g. Facebook, Google, etc.)
- leads.city (text, nullable) — candidate city

## New Tables
1. directory_entries — saved lead/candidate records for future reference
2. directory_labels — configurable labels for directory entries
3. payment_merchants — Razorpay merchant/payment configuration (admin only)
4. payment_records — payment/collection tracking records

## Security
- All new tables have RLS enabled
- Admin-only CRUD on directory_labels, payment_merchants, payment_records
- directory_entries: admin full CRUD, employee SELECT own
- No service-role keys stored in database
*/

-- ============ ADD COLUMNS TO LEADS ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'platform') THEN
    ALTER TABLE leads ADD COLUMN platform text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'city') THEN
    ALTER TABLE leads ADD COLUMN city text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_platform ON leads(platform);
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_created_product ON leads(created_at, product_id);

-- ============ DIRECTORY LABELS ============
CREATE TABLE IF NOT EXISTS directory_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE directory_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dir_labels_admin_select" ON directory_labels;
CREATE POLICY "dir_labels_admin_select" ON directory_labels FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "dir_labels_admin_insert" ON directory_labels;
CREATE POLICY "dir_labels_admin_insert" ON directory_labels FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "dir_labels_admin_update" ON directory_labels;
CREATE POLICY "dir_labels_admin_update" ON directory_labels FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "dir_labels_admin_delete" ON directory_labels;
CREATE POLICY "dir_labels_admin_delete" ON directory_labels FOR DELETE
  TO authenticated USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_dir_labels_updated ON directory_labels;
CREATE TRIGGER trg_dir_labels_updated BEFORE UPDATE ON directory_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ DIRECTORY ENTRIES ============
CREATE TABLE IF NOT EXISTS directory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  platform text,
  city text,
  status text NOT NULL DEFAULT '',
  label_id uuid REFERENCES directory_labels(id) ON DELETE SET NULL,
  candidate_name text NOT NULL DEFAULT '',
  phone_number text NOT NULL DEFAULT '',
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  remarks text NOT NULL DEFAULT '',
  saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE directory_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dir_entries_admin_select" ON directory_entries;
CREATE POLICY "dir_entries_admin_select" ON directory_entries FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "dir_entries_admin_insert" ON directory_entries;
CREATE POLICY "dir_entries_admin_insert" ON directory_entries FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "dir_entries_admin_update" ON directory_entries;
CREATE POLICY "dir_entries_admin_update" ON directory_entries FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "dir_entries_admin_delete" ON directory_entries;
CREATE POLICY "dir_entries_admin_delete" ON directory_entries FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_dir_entries_product ON directory_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_dir_entries_label ON directory_entries(label_id);
CREATE INDEX IF NOT EXISTS idx_dir_entries_phone ON directory_entries(phone_number);
CREATE INDEX IF NOT EXISTS idx_dir_entries_employee ON directory_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_dir_entries_saved ON directory_entries(saved_at);

DROP TRIGGER IF EXISTS trg_dir_entries_updated ON directory_entries;
CREATE TRIGGER trg_dir_entries_updated BEFORE UPDATE ON directory_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PAYMENT MERCHANTS ============
CREATE TABLE IF NOT EXISTS payment_merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'RAZORPAY',
  razorpay_key_id text NOT NULL DEFAULT '',
  -- Secret key is NEVER stored here. It lives only in Vercel env vars / edge function secrets.
  webhook_secret_configured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pay_merchants_admin_select" ON payment_merchants;
CREATE POLICY "pay_merchants_admin_select" ON payment_merchants FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "pay_merchants_admin_insert" ON payment_merchants;
CREATE POLICY "pay_merchants_admin_insert" ON payment_merchants FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pay_merchants_admin_update" ON payment_merchants;
CREATE POLICY "pay_merchants_admin_update" ON payment_merchants FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pay_merchants_admin_delete" ON payment_merchants;
CREATE POLICY "pay_merchants_admin_delete" ON payment_merchants FOR DELETE
  TO authenticated USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_pay_merchants_updated ON payment_merchants;
CREATE TRIGGER trg_pay_merchants_updated BEFORE UPDATE ON payment_merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PAYMENT RECORDS ============
CREATE TABLE IF NOT EXISTS payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  candidate_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN
    ('PENDING','COMPLETED','FAILED','REFUNDED','PARTIAL')),
  payment_method text NOT NULL DEFAULT 'CASH' CHECK (payment_method IN
    ('CASH','UPI','CARD','NETBANKING','WALLET','OTHER')),
  transaction_id text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_time time NOT NULL DEFAULT '00:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pay_records_admin_select" ON payment_records;
CREATE POLICY "pay_records_admin_select" ON payment_records FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "pay_records_admin_insert" ON payment_records;
CREATE POLICY "pay_records_admin_insert" ON payment_records FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pay_records_admin_update" ON payment_records;
CREATE POLICY "pay_records_admin_update" ON payment_records FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pay_records_admin_delete" ON payment_records;
CREATE POLICY "pay_records_admin_delete" ON payment_records FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_pay_records_product ON payment_records(product_id);
CREATE INDEX IF NOT EXISTS idx_pay_records_employee ON payment_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_records_status ON payment_records(payment_status);
CREATE INDEX IF NOT EXISTS idx_pay_records_date ON payment_records(payment_date);
CREATE INDEX IF NOT EXISTS idx_pay_records_lead ON payment_records(lead_id);

DROP TRIGGER IF EXISTS trg_pay_records_updated ON payment_records;
CREATE TRIGGER trg_pay_records_updated BEFORE UPDATE ON payment_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grant privileges on new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON directory_labels, directory_entries, payment_merchants, payment_records TO authenticated, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
