/*
# Module 3: HC lead fields, import tracking, duplicate persistence

## Changes

### 1. HC lead fields on leads table
- vehicle_no, dl_no, total_trips, license_no (nullable text/int)
- These are only populated for HC product leads

### 2. Expand import_batches
- Add product_id, platform, uploaded_by (FK profiles)
- Add existing_lead_duplicates, internal_duplicates, skipped counts
- Add file_name column (alias of existing filename)

### 3. New table: import_records
- One row per processed import row
- Tracks: batch_id, name, phone, product_id, platform, city, label, status,
  duplicate_type (NONE, INTERNAL_DUPLICATE, EXISTING_LEAD_DUPLICATE),
  existing_lead_id (FK to leads), row_number, validation_error

### 4. Indexes for performance
- import_records: batch_id, existing_lead_id, duplicate_type
- leads: vehicle_no, dl_no, license_no for HC duplicate checks
- directory_entries: import_batch_id, duplicate_type

### 5. RLS on import_records
- Admin: full CRUD
- Manager: SELECT only for assigned products
- Employee: no access
*/

-- 1. HC lead fields
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vehicle_no text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS dl_no text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS total_trips integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS license_no text;

-- 2. Expand import_batches
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS existing_lead_duplicates integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS internal_duplicates integer NOT NULL DEFAULT 0;
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS skipped integer NOT NULL DEFAULT 0;

-- 3. import_records table
CREATE TABLE IF NOT EXISTS public.import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  platform text,
  city text,
  label text,
  status text NOT NULL DEFAULT 'IMPORTED',
  duplicate_type text NOT NULL DEFAULT 'NONE',
  existing_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  validation_error text,
  imported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_records_admin_select" ON public.import_records;
DROP POLICY IF EXISTS "import_records_admin_insert" ON public.import_records;
DROP POLICY IF EXISTS "import_records_admin_update" ON public.import_records;
DROP POLICY IF EXISTS "import_records_admin_delete" ON public.import_records;
DROP POLICY IF EXISTS "import_records_manager_select" ON public.import_records;

CREATE POLICY "import_records_admin_select" ON public.import_records
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "import_records_admin_insert" ON public.import_records
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "import_records_admin_update" ON public.import_records
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "import_records_admin_delete" ON public.import_records
  FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY "import_records_manager_select" ON public.import_records
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_leads_vehicle_no ON public.leads (vehicle_no);
CREATE INDEX IF NOT EXISTS idx_leads_dl_no ON public.leads (dl_no);
CREATE INDEX IF NOT EXISTS idx_leads_license_no ON public.leads (license_no);

CREATE INDEX IF NOT EXISTS idx_import_records_batch ON public.import_records (batch_id);
CREATE INDEX IF NOT EXISTS idx_import_records_lead ON public.import_records (existing_lead_id);
CREATE INDEX IF NOT EXISTS idx_import_records_dup_type ON public.import_records (duplicate_type);

CREATE INDEX IF NOT EXISTS idx_import_batches_product ON public.import_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_created ON public.import_batches (created_at);

-- 5. Add import_batch_id to directory_entries for import tracking
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS duplicate_type text NOT NULL DEFAULT 'NONE';
ALTER TABLE public.directory_entries ADD COLUMN IF NOT EXISTS existing_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dir_entries_batch ON public.directory_entries (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_dir_entries_dup_type ON public.directory_entries (duplicate_type);

-- 6. Manager policies for import_batches
DROP POLICY IF EXISTS "import_batches_manager_select" ON public.import_batches;
CREATE POLICY "import_batches_manager_select" ON public.import_batches
  FOR SELECT TO authenticated
  USING (is_manager() AND product_id = ANY(assigned_product_ids()));
