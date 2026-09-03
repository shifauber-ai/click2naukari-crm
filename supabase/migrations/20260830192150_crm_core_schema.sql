/*
# Click2Naukari CRM — Core Schema

## Overview
Creates the complete normalized schema for the Click2Naukari CRM: products,
profiles (auth-linked users with roles), caller queues, leads, assignment and
status history, scheduled transitions (backend-driven rotation), issues,
other-hero leads, hero IDs, SIMs, WhatsApp accounts, import batches/rows, and
audit logs. Includes indexes and helper functions.

## Tables
1. profiles — auth.users-linked account with role (ADMIN/EMPLOYEE), name, active flag.
2. products — master products (id, name, code, is_active).
3. caller_queues — per-product ordered employee queue (product, employee, priority, is_active).
4. leads — leads with current caller, status, rotation count, follow-up timestamps.
5. lead_assignments — full assignment history (initial, rotations, admin/manual reassignments).
6. lead_status_history — every status change with actor.
7. scheduled_transitions — backend-driven pending timers for RINGING/INTERESTED/CALLBACK rotation.
8. issues — ID_BLOCK / document / vehicle / other issues.
9. other_hero_leads — leads moved to the "Other Hero" tab.
10. hero_ids — hero ID master with assignment to employee/product.
11. hero_assignment_history — hero ID reassignment history.
12. sims — SIM inventory with status and assignment.
13. sim_assignment_history — SIM reassignment history.
14. whatsapp_accounts — per-employee WhatsApp integration record (no secrets).
15. import_batches — metadata for each import run.
16. import_rows — per-row import status/error.
17. audit_logs — actor/action/entity audit trail.

## Security
- RLS enabled on every table.
- Policies use a SECURITY DEFINER helper is_admin() so role checks are DB-enforced.
- Admin: full access to operational tables. Employee: scoped to own data only.
- Employees cannot directly INSERT/UPDATE/DELETE leads, assignments, transitions,
  or history — those mutations happen only through SECURITY DEFINER RPC functions
  which verify ownership/role server-side.
- Hero/SIM/WhatsApp/audit/import tables are admin-only.

## Notes
- Status values are enforced with CHECK constraints (text), not enums, for flexibility.
- Foreign keys enforce referential integrity.
- owner columns default to auth.uid() where appropriate.
*/

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('ADMIN','EMPLOYEE')),
  is_active boolean NOT NULL DEFAULT true,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON profiles(role, is_active);

-- ============ PRODUCTS ============
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- ============ CALLER QUEUES ============
CREATE TABLE IF NOT EXISTS caller_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, employee_id)
);
ALTER TABLE caller_queues ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_caller_queues_product_active ON caller_queues(product_id, is_active, priority);

-- ============ LEADS ============
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  current_caller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN
    ('NEW','RINGING','INTERESTED','CALLBACK','ID_DONE','ID_BLOCK',
     'DOC_ISSUE','VEHICLE_ISSUE','OTHER_ISSUE','OTHER_HERO','ADMIN_REVIEW')),
  remarks text NOT NULL DEFAULT '',
  rotation_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  in_admin_review boolean NOT NULL DEFAULT false,
  assigned_at timestamptz,
  last_contact_at timestamptz,
  next_followup_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_product ON leads(product_id);
CREATE INDEX IF NOT EXISTS idx_leads_caller ON leads(current_caller_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_active ON leads(is_active);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(next_followup_at);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_product_caller_status ON leads(product_id, current_caller_id, status);

-- ============ LEAD ASSIGNMENTS ============
CREATE TABLE IF NOT EXISTS lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  previous_caller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  new_caller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  assignment_reason text NOT NULL CHECK (assignment_reason IN
    ('INITIAL_ASSIGNMENT','RINGING_ROTATION','INTERESTED_ROTATION','CALLBACK_ROTATION',
     'ADMIN_REASSIGNMENT','MANUAL_ASSIGNMENT')),
  actor_type text NOT NULL DEFAULT 'SYSTEM' CHECK (actor_type IN ('SYSTEM','ADMIN','EMPLOYEE')),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  attempt_number int NOT NULL DEFAULT 0,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_assignments_lead ON lead_assignments(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assignments_caller ON lead_assignments(new_caller_id);

-- ============ LEAD STATUS HISTORY ============
CREATE TABLE IF NOT EXISTS lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  previous_status text,
  new_status text NOT NULL,
  remarks text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'EMPLOYEE' CHECK (actor_type IN ('SYSTEM','ADMIN','EMPLOYEE')),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lead_status_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_statushist_lead ON lead_status_history(lead_id, created_at);

-- ============ SCHEDULED TRANSITIONS ============
CREATE TABLE IF NOT EXISTS scheduled_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  current_caller_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  expected_status text NOT NULL,
  next_action_at timestamptz NOT NULL,
  transition_type text NOT NULL CHECK (transition_type IN
    ('RINGING_ROTATION','INTERESTED_ROTATION','CALLBACK_ROTATION')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN
    ('PENDING','PROCESSING','COMPLETED','CANCELLED','FAILED')),
  attempt_number int NOT NULL DEFAULT 1,
  error_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE scheduled_transitions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_transitions_pending ON scheduled_transitions(status, next_action_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_transitions_lead ON scheduled_transitions(lead_id);
CREATE INDEX IF NOT EXISTS idx_transitions_status ON scheduled_transitions(status);

-- ============ ISSUES ============
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  issue_type text NOT NULL CHECK (issue_type IN
    ('ID_BLOCK','DOCUMENT_ISSUE','VEHICLE_ISSUE','OTHER_ISSUE')),
  issue_status text NOT NULL DEFAULT 'OPEN' CHECK (issue_status IN
    ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_issues_lead ON issues(lead_id);
CREATE INDEX IF NOT EXISTS idx_issues_type_status ON issues(issue_type, issue_status);

-- ============ OTHER HERO LEADS ============
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
CREATE INDEX IF NOT EXISTS idx_otherhero_lead ON other_hero_leads(lead_id);

-- ============ HERO IDS ============
CREATE TABLE IF NOT EXISTS hero_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_code text NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hero_ids ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_heroids_status ON hero_ids(status);
CREATE INDEX IF NOT EXISTS idx_heroids_product ON hero_ids(product_id);

CREATE TABLE IF NOT EXISTS hero_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_id_id uuid NOT NULL REFERENCES hero_ids(id) ON DELETE CASCADE,
  previous_employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  new_employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hero_assignment_history ENABLE ROW LEVEL SECURITY;

-- ============ SIMS ============
CREATE TABLE IF NOT EXISTS sims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_code text NOT NULL,
  mobile_number text NOT NULL DEFAULT '',
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN
    ('AVAILABLE','IN_USE','INACTIVE','LOST','REPLACED')),
  assigned_date timestamptz,
  released_date timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sims ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sims_status ON sims(status);

CREATE TABLE IF NOT EXISTS sim_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_id_id uuid NOT NULL REFERENCES sims(id) ON DELETE CASCADE,
  previous_employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  new_employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sim_assignment_history ENABLE ROW LEVEL SECURITY;

-- ============ WHATSAPP ACCOUNTS ============
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  whatsapp_number text NOT NULL DEFAULT '',
  connection_status text NOT NULL DEFAULT 'PENDING' CHECK (connection_status IN
    ('CONNECTED','DISCONNECTED','PENDING','INACTIVE')),
  integration_status text NOT NULL DEFAULT 'PENDING',
  last_connected timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;

-- ============ IMPORT BATCHES / ROWS ============
CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL DEFAULT '',
  total_rows int NOT NULL DEFAULT 0,
  imported int NOT NULL DEFAULT 0,
  duplicate int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  invalid int NOT NULL DEFAULT 0,
  missing_fields int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN
    ('PENDING','COMPLETED','FAILED')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN
    ('PENDING','IMPORTED','DUPLICATE','FAILED','INVALID')),
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_importrows_batch ON import_rows(batch_id);

-- ============ AUDIT LOGS ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);

-- ============ HELPER FUNCTIONS ============

-- is_admin(): DB-enforced role check. SECURITY DEFINER so it bypasses RLS to read role.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN' AND is_active = true
  );
$$;

-- current_profile_id(): returns the caller's profile id (auth.uid()).
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_caller_queues_updated ON caller_queues;
CREATE TRIGGER trg_caller_queues_updated BEFORE UPDATE ON caller_queues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_leads_updated ON leads;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_issues_updated ON issues;
CREATE TRIGGER trg_issues_updated BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_otherhero_updated ON other_hero_leads;
CREATE TRIGGER trg_otherhero_updated BEFORE UPDATE ON other_hero_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_heroids_updated ON hero_ids;
CREATE TRIGGER trg_heroids_updated BEFORE UPDATE ON hero_ids
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sims_updated ON sims;
CREATE TRIGGER trg_sims_updated BEFORE UPDATE ON sims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_updated ON whatsapp_accounts;
CREATE TRIGGER trg_whatsapp_updated BEFORE UPDATE ON whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RLS POLICIES ============

-- PROFILES: admin sees all; a user sees only their own row.
DROP POLICY IF EXISTS "profiles_admin_select_all" ON profiles;
CREATE POLICY "profiles_admin_select_all" ON profiles FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- profiles INSERT/DELETE handled only via SECURITY DEFINER / service role (edge functions).
-- Allow admin insert too (for re-creating profile rows).
DROP POLICY IF EXISTS "profiles_admin_insert" ON profiles;
CREATE POLICY "profiles_admin_insert" ON profiles FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- PRODUCTS: admin full CRUD; employee SELECT only.
DROP POLICY IF EXISTS "products_select_any" ON products;
CREATE POLICY "products_select_any" ON products FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "products_admin_insert" ON products;
CREATE POLICY "products_admin_insert" ON products FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_admin_update" ON products;
CREATE POLICY "products_admin_update" ON products FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_admin_delete" ON products;
CREATE POLICY "products_admin_delete" ON products FOR DELETE
  TO authenticated USING (public.is_admin());

-- CALLER QUEUES: admin only (employees don't manage queues).
DROP POLICY IF EXISTS "caller_queues_admin_select" ON caller_queues;
CREATE POLICY "caller_queues_admin_select" ON caller_queues FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "caller_queues_admin_insert" ON caller_queues;
CREATE POLICY "caller_queues_admin_insert" ON caller_queues FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "caller_queues_admin_update" ON caller_queues;
CREATE POLICY "caller_queues_admin_update" ON caller_queues FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "caller_queues_admin_delete" ON caller_queues;
CREATE POLICY "caller_queues_admin_delete" ON caller_queues FOR DELETE
  TO authenticated USING (public.is_admin());

-- LEADS: admin full CRUD; employee SELECT own + UPDATE own (status via RPC).
DROP POLICY IF EXISTS "leads_admin_select_all" ON leads;
CREATE POLICY "leads_admin_select_all" ON leads FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "leads_select_own" ON leads;
CREATE POLICY "leads_select_own" ON leads FOR SELECT
  TO authenticated USING (auth.uid() = current_caller_id);

DROP POLICY IF EXISTS "leads_admin_insert" ON leads;
CREATE POLICY "leads_admin_insert" ON leads FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leads_admin_update" ON leads;
CREATE POLICY "leads_admin_update" ON leads FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leads_admin_delete" ON leads;
CREATE POLICY "leads_admin_delete" ON leads FOR DELETE
  TO authenticated USING (public.is_admin());

-- LEAD ASSIGNMENTS: admin SELECT; employee SELECT for own leads. No direct writes (RPC only).
DROP POLICY IF EXISTS "assignments_admin_select" ON lead_assignments;
CREATE POLICY "assignments_admin_select" ON lead_assignments FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "assignments_select_own" ON lead_assignments;
CREATE POLICY "assignments_select_own" ON lead_assignments FOR SELECT
  TO authenticated USING (
    auth.uid() = new_caller_id OR auth.uid() = previous_caller_id
  );

-- LEAD STATUS HISTORY: same pattern.
DROP POLICY IF EXISTS "statushist_admin_select" ON lead_status_history;
CREATE POLICY "statushist_admin_select" ON lead_status_history FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "statushist_select_own" ON lead_status_history;
CREATE POLICY "statushist_select_own" ON lead_status_history FOR SELECT
  TO authenticated USING (auth.uid() = employee_id OR auth.uid() = actor_id);

-- SCHEDULED TRANSITIONS: admin SELECT; employee SELECT for own leads (countdown UX).
DROP POLICY IF EXISTS "transitions_admin_select" ON scheduled_transitions;
CREATE POLICY "transitions_admin_select" ON scheduled_transitions FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "transitions_select_own" ON scheduled_transitions;
CREATE POLICY "transitions_select_own" ON scheduled_transitions FOR SELECT
  TO authenticated USING (auth.uid() = current_caller_id);

-- ISSUES: admin full; employee SELECT/UPDATE own.
DROP POLICY IF EXISTS "issues_admin_select" ON issues;
CREATE POLICY "issues_admin_select" ON issues FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "issues_select_own" ON issues;
CREATE POLICY "issues_select_own" ON issues FOR SELECT
  TO authenticated USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "issues_admin_update" ON issues;
CREATE POLICY "issues_admin_update" ON issues FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "issues_update_own" ON issues;
CREATE POLICY "issues_update_own" ON issues FOR UPDATE
  TO authenticated USING (auth.uid() = employee_id) WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "issues_admin_insert" ON issues;
CREATE POLICY "issues_admin_insert" ON issues FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- OTHER HERO LEADS: admin full; employee SELECT own.
DROP POLICY IF EXISTS "otherhero_admin_select" ON other_hero_leads;
CREATE POLICY "otherhero_admin_select" ON other_hero_leads FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "otherhero_select_own" ON other_hero_leads;
CREATE POLICY "otherhero_select_own" ON other_hero_leads FOR SELECT
  TO authenticated USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "otherhero_admin_update" ON other_hero_leads;
CREATE POLICY "otherhero_admin_update" ON other_hero_leads FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "otherhero_admin_insert" ON other_hero_leads;
CREATE POLICY "otherhero_admin_insert" ON other_hero_leads FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- HERO IDS: admin only.
DROP POLICY IF EXISTS "hero_ids_admin_all" ON hero_ids;
CREATE POLICY "hero_ids_admin_all" ON hero_ids FOR SELECT
  TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "hero_ids_admin_insert" ON hero_ids;
CREATE POLICY "hero_ids_admin_insert" ON hero_ids FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "hero_ids_admin_update" ON hero_ids;
CREATE POLICY "hero_ids_admin_update" ON hero_ids FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "hero_ids_admin_delete" ON hero_ids;
CREATE POLICY "hero_ids_admin_delete" ON hero_ids FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "hero_hist_admin_all" ON hero_assignment_history;
CREATE POLICY "hero_hist_admin_all" ON hero_assignment_history FOR SELECT
  TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "hero_hist_admin_insert" ON hero_assignment_history;
CREATE POLICY "hero_hist_admin_insert" ON hero_assignment_history FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- SIMS: admin only.
DROP POLICY IF EXISTS "sims_admin_all" ON sims;
CREATE POLICY "sims_admin_all" ON sims FOR SELECT
  TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "sims_admin_insert" ON sims;
CREATE POLICY "sims_admin_insert" ON sims FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "sims_admin_update" ON sims;
CREATE POLICY "sims_admin_update" ON sims FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "sims_admin_delete" ON sims;
CREATE POLICY "sims_admin_delete" ON sims FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "sim_hist_admin_all" ON sim_assignment_history;
CREATE POLICY "sim_hist_admin_all" ON sim_assignment_history FOR SELECT
  TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "sim_hist_admin_insert" ON sim_assignment_history;
CREATE POLICY "sim_hist_admin_insert" ON sim_assignment_history FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- WHATSAPP: admin only.
DROP POLICY IF EXISTS "whatsapp_admin_all" ON whatsapp_accounts;
CREATE POLICY "whatsapp_admin_all" ON whatsapp_accounts FOR SELECT
  TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "whatsapp_admin_insert" ON whatsapp_accounts;
CREATE POLICY "whatsapp_admin_insert" ON whatsapp_accounts FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "whatsapp_admin_update" ON whatsapp_accounts;
CREATE POLICY "whatsapp_admin_update" ON whatsapp_accounts FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "whatsapp_admin_delete" ON whatsapp_accounts;
CREATE POLICY "whatsapp_admin_delete" ON whatsapp_accounts FOR DELETE
  TO authenticated USING (public.is_admin());

-- IMPORT BATCHES/ROWS: admin only.
DROP POLICY IF EXISTS "import_batches_admin_all" ON import_batches;
CREATE POLICY "import_batches_admin_all" ON import_batches FOR SELECT
  TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "import_batches_admin_insert" ON import_batches;
CREATE POLICY "import_batches_admin_insert" ON import_batches FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "import_batches_admin_update" ON import_batches;
CREATE POLICY "import_batches_admin_update" ON import_batches FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "import_rows_admin_all" ON import_rows;
CREATE POLICY "import_rows_admin_all" ON import_rows FOR SELECT
  TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "import_rows_admin_insert" ON import_rows;
CREATE POLICY "import_rows_admin_insert" ON import_rows FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- AUDIT LOGS: admin SELECT only (writes happen via SECURITY DEFINER / service role).
DROP POLICY IF EXISTS "audit_admin_select" ON audit_logs;
CREATE POLICY "audit_admin_select" ON audit_logs FOR SELECT
  TO authenticated USING (public.is_admin());

-- Grant necessary privileges
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon;
