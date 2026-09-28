/*
# 003 — Leads Core Tables

## Purpose
Creates (or ensures existence of) all lead-related tables required by the CRM frontend.

## Tables

### leads
- Core CRM lead record. Status is text (not enum) to support dynamic platform statuses.
- Fields: id, name, phone, mobile, product_id, current_caller_id, status, remarks, rotation_count, is_active, in_admin_review, assigned_at, last_contact_at, next_followup_at, created_by, created_at, updated_at, city, platform, vehicle_no, dl_no, license_no, form_status

### lead_status_history
- Audit trail of lead status changes
- Fields: id, lead_id, previous_status, new_status, remarks, actor_type, actor_id, employee_id, product_id, created_at

### lead_assignments
- Audit trail of lead reassignments between callers
- Fields: id, lead_id, product_id, previous_caller_id, new_caller_id, previous_status, new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks, created_at

### lead_platform_status
- Per-platform status tracking for a lead
- Fields: id, lead_id, platform, status, completed_by, remarks, created_at

### scheduled_transitions
- Scheduled state transitions for leads (used for ringing rotation)
- Fields: id, lead_id, product_id, current_caller_id, expected_status, next_action_at, transition_type, status, attempt_number, error_info, created_at, processed_at

### call_history
- Record of calls made to leads
- Fields: id, lead_id, product_id, phone_number, normalized_phone, direction, call_status, duration_seconds, outcome, remarks, is_simulated, caller_id, call_timestamp, created_at, external_call_id, device_id, sync_source, synced_at

### issues
- Issues raised for leads
- Fields: id, lead_id, product_id, employee_id, issue_type, issue_status, remarks, created_at, updated_at

### other_hero_leads
- Other hero-related leads
- Fields: id, lead_id, product_id, employee_id, remarks, created_at, updated_at

### Foreign Keys
- leads.product_id → products(id) ON DELETE CASCADE
- leads.current_caller_id → profiles(id) ON DELETE SET NULL
- leads.created_by → profiles(id) ON DELETE SET NULL
- lead_status_history.lead_id → leads(id) ON DELETE CASCADE
- lead_status_history.actor_id → profiles(id) ON DELETE SET NULL
- lead_status_history.employee_id → profiles(id) ON DELETE SET NULL
- lead_status_history.product_id → products(id) ON DELETE CASCADE
- lead_assignments.lead_id → leads(id) ON DELETE CASCADE
- lead_assignments.product_id → products(id) ON DELETE CASCADE
- lead_assignments.previous_caller_id → profiles(id) ON DELETE SET NULL
- lead_assignments.new_caller_id → profiles(id) ON DELETE SET NULL
- lead_assignments.actor_id → profiles(id) ON DELETE SET NULL
- lead_platform_status.lead_id → leads(id) ON DELETE CASCADE
- lead_platform_status.completed_by → profiles(id) ON DELETE SET NULL
- scheduled_transitions.lead_id → leads(id) ON DELETE CASCADE
- scheduled_transitions.product_id → products(id) ON DELETE CASCADE
- scheduled_transitions.current_caller_id → profiles(id) ON DELETE SET NULL
- call_history.lead_id → leads(id) ON DELETE SET NULL
- call_history.product_id → products(id) ON DELETE SET NULL
- call_history.caller_id → profiles(id) ON DELETE SET NULL
- issues.lead_id → leads(id) ON DELETE CASCADE
- issues.product_id → products(id) ON DELETE CASCADE
- issues.employee_id → profiles(id) ON DELETE SET NULL
- other_hero_leads.lead_id → leads(id) ON DELETE CASCADE
- other_hero_leads.product_id → products(id) ON DELETE CASCADE
- other_hero_leads.employee_id → profiles(id) ON DELETE SET NULL

### Notes
- All statements use IF NOT EXISTS for idempotency
- leads.status is text (not enum) to support dynamic platform-specific statuses
- leads.city is text (city name) not FK — matches frontend contract
- leads.platform is text (platform name) not FK — matches frontend contract
*/

-- === leads ===
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text DEFAULT '',
  phone text,
  mobile text,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  current_caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'NEW',
  remarks text DEFAULT '',
  rotation_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  in_admin_review boolean NOT NULL DEFAULT false,
  assigned_at timestamptz,
  last_contact_at timestamptz,
  next_followup_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  city text DEFAULT '',
  platform text DEFAULT '',
  vehicle_no text DEFAULT '',
  dl_no text DEFAULT '',
  license_no text DEFAULT '',
  form_status text DEFAULT 'PENDING'
);

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS name text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS mobile text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS current_caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'NEW';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rotation_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS in_admin_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_followup_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS city text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS platform text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vehicle_no text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS dl_no text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS license_no text DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS form_status text DEFAULT 'PENDING';

-- === lead_status_history ===
CREATE TABLE IF NOT EXISTS public.lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  previous_status text,
  new_status text,
  remarks text DEFAULT '',
  actor_type text DEFAULT 'SYSTEM',
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS previous_status text;
ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS new_status text;
ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS actor_type text DEFAULT 'SYSTEM';
ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.lead_status_history ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- === lead_assignments ===
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  previous_caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  assignment_reason text DEFAULT '',
  actor_type text DEFAULT 'SYSTEM',
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attempt_number integer NOT NULL DEFAULT 0,
  remarks text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS previous_caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS new_caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS previous_status text;
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS new_status text;
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS assignment_reason text DEFAULT '';
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS actor_type text DEFAULT 'SYSTEM';
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 0;
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE public.lead_assignments ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- === lead_platform_status ===
CREATE TABLE IF NOT EXISTS public.lead_platform_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  remarks text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_platform_status ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_platform_status ADD COLUMN IF NOT EXISTS platform text NOT NULL;
ALTER TABLE public.lead_platform_status ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.lead_platform_status ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_platform_status ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE public.lead_platform_status ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_platform_status_unique ON public.lead_platform_status(lead_id, platform);

-- === scheduled_transitions ===
CREATE TABLE IF NOT EXISTS public.scheduled_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  current_caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expected_status text,
  next_action_at timestamptz,
  transition_type text DEFAULT 'RINGING_ROTATION',
  status text NOT NULL DEFAULT 'PENDING',
  attempt_number integer NOT NULL DEFAULT 0,
  error_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS current_caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS expected_status text;
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS next_action_at timestamptz;
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS transition_type text DEFAULT 'RINGING_ROTATION';
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 0;
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS error_info text;
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.scheduled_transitions ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- === call_history ===
CREATE TABLE IF NOT EXISTS public.call_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  phone_number text NOT NULL DEFAULT '',
  normalized_phone text,
  direction text NOT NULL DEFAULT 'OUTGOING',
  call_status text NOT NULL DEFAULT '',
  duration_seconds integer NOT NULL DEFAULT 0,
  outcome text,
  remarks text,
  is_simulated boolean NOT NULL DEFAULT false,
  caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  call_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  external_call_id text,
  device_id text,
  sync_source text DEFAULT 'MANUAL',
  synced_at timestamptz
);

ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS phone_number text NOT NULL DEFAULT '';
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS normalized_phone text;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'OUTGOING';
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS call_status text NOT NULL DEFAULT '';
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS caller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS call_timestamp timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS external_call_id text;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS sync_source text DEFAULT 'MANUAL';
ALTER TABLE public.call_history ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- === issues ===
CREATE TABLE IF NOT EXISTS public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issue_type text NOT NULL DEFAULT 'GENERAL',
  issue_status text NOT NULL DEFAULT 'OPEN',
  remarks text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS issue_type text NOT NULL DEFAULT 'GENERAL';
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS issue_status text NOT NULL DEFAULT 'OPEN';
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- === other_hero_leads ===
CREATE TABLE IF NOT EXISTS public.other_hero_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  remarks text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.other_hero_leads ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.other_hero_leads ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.other_hero_leads ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.other_hero_leads ADD COLUMN IF NOT EXISTS remarks text DEFAULT '';
ALTER TABLE public.other_hero_leads ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.other_hero_leads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
