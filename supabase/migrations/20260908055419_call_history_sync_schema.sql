/*
# Call History Sync Schema — Android Phone Log Synchronization

## Purpose
Prepare the database for real Android call-log synchronization via a secure
Supabase Edge Function. The Edge Function will authenticate the employee and
insert call records using the service-role key (never exposed to clients).

## Changes to existing tables
- `call_history` — adds 5 new nullable columns (no existing columns removed/renamed):
  - `sync_source` text DEFAULT 'ANDROID'
  - `device_id` text NULL
  - `external_call_id` text NULL
  - `normalized_phone` text NULL
  - `synced_at` timestamptz NULL

## New tables
- `caller_devices` — registers employee Android devices for sync tracking
  - id uuid PK
  - employee_id uuid FK → profiles(id) ON DELETE CASCADE
  - device_name text NOT NULL
  - device_identifier text NOT NULL UNIQUE
  - phone_number text NULL
  - is_active boolean DEFAULT true
  - last_sync_at timestamptz NULL
  - created_at timestamptz DEFAULT now()
  - updated_at timestamptz DEFAULT now()

## New indexes
- call_history: normalized_phone, external_call_id, device_id
- caller_devices: employee_id, device_identifier (unique), is_active

## New functions
- normalize_phone_number(phone_input text) → text
  Strips formatting, normalizes Indian numbers to 91XXXXXXXXXX format,
  leaves genuine international numbers intact.
- match_call_to_lead(p_normalized_phone text, p_caller_id uuid) → table(lead_id uuid, product_id uuid)
  Safely resolves a call to the best-matching lead without modifying leads.
- insert_synced_call(...) → json
  Normalizes phone, matches lead, prevents duplicates, inserts into call_history.
  Designed to be called by the Edge Function with service-role privileges.

## Duplicate protection
- Unique index on call_history using COALESCE for nullable columns:
  (caller_id, normalized_phone, call_timestamp, direction)
  This prevents duplicate Android sync retries.

## RLS
- caller_devices: admin full CRUD, employees SELECT their own devices only.
- call_history RLS: UNCHANGED. No employee INSERT policy added.
  The Edge Function will insert via service-role (bypasses RLS).

## Retention
- The existing 7-day retention cron job is NOT modified.

## Data safety
- No existing columns removed or renamed.
- No existing data deleted.
- All new columns are nullable with safe defaults.
*/

-- ============================================================
-- 1. Add new columns to call_history (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_history' AND column_name = 'sync_source') THEN
    ALTER TABLE public.call_history ADD COLUMN sync_source text DEFAULT 'ANDROID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_history' AND column_name = 'device_id') THEN
    ALTER TABLE public.call_history ADD COLUMN device_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_history' AND column_name = 'external_call_id') THEN
    ALTER TABLE public.call_history ADD COLUMN external_call_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_history' AND column_name = 'normalized_phone') THEN
    ALTER TABLE public.call_history ADD COLUMN normalized_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_history' AND column_name = 'synced_at') THEN
    ALTER TABLE public.call_history ADD COLUMN synced_at timestamptz;
  END IF;
END $$;

-- ============================================================
-- 2. New indexes on call_history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_call_history_normalized_phone ON public.call_history(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_call_history_external_call_id ON public.call_history(external_call_id);
CREATE INDEX IF NOT EXISTS idx_call_history_device_id ON public.call_history(device_id);

-- ============================================================
-- 3. Duplicate protection — unique index with COALESCE for NULL safety
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_history_sync_dedup
  ON public.call_history (
    COALESCE(caller_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(normalized_phone, ''),
    call_timestamp,
    direction
  );

-- ============================================================
-- 4. Create caller_devices table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.caller_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_name text NOT NULL,
  device_identifier text NOT NULL UNIQUE,
  phone_number text,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caller_devices_employee_id ON public.caller_devices(employee_id);
CREATE INDEX IF NOT EXISTS idx_caller_devices_is_active ON public.caller_devices(is_active);

ALTER TABLE public.caller_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caller_devices_admin_select" ON public.caller_devices;
CREATE POLICY "caller_devices_admin_select" ON public.caller_devices FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "caller_devices_admin_insert" ON public.caller_devices;
CREATE POLICY "caller_devices_admin_insert" ON public.caller_devices FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "caller_devices_admin_update" ON public.caller_devices;
CREATE POLICY "caller_devices_admin_update" ON public.caller_devices FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "caller_devices_admin_delete" ON public.caller_devices;
CREATE POLICY "caller_devices_admin_delete" ON public.caller_devices FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "caller_devices_select_own" ON public.caller_devices;
CREATE POLICY "caller_devices_select_own" ON public.caller_devices FOR SELECT
  TO authenticated USING (auth.uid() = employee_id);

DROP TRIGGER IF EXISTS trg_caller_devices_updated ON public.caller_devices;
CREATE TRIGGER trg_caller_devices_updated BEFORE UPDATE ON public.caller_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.caller_devices TO authenticated;

-- ============================================================
-- 5. normalize_phone_number function
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_phone_number(phone_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
  v_len int;
BEGIN
  IF phone_input IS NULL THEN
    RETURN NULL;
  END IF;

  -- Strip all non-digit characters
  v_digits := regexp_replace(phone_input, '[^0-9]', '', 'g');
  v_len := length(v_digits);

  IF v_len = 0 THEN
    RETURN NULL;
  END IF;

  -- 10-digit Indian number: prepend 91
  IF v_len = 10 THEN
    RETURN '91' || v_digits;
  END IF;

  -- 11-digit starting with 0 (e.g. 08104488522): strip leading 0, prepend 91
  IF v_len = 11 AND v_digits LIKE '0%' THEN
    RETURN '91' || substring(v_digits, 2);
  END IF;

  -- 12-digit starting with 91 (e.g. 918104488522): already normalized
  IF v_len = 12 AND v_digits LIKE '91%' THEN
    RETURN v_digits;
  END IF;

  -- 13-digit starting with 91 (e.g. 91918104488522 — double country code): take last 12
  IF v_len = 13 AND v_digits LIKE '91%' THEN
    RETURN substring(v_digits, 2);
  END IF;

  -- Any other number: return digits as-is (international, unknown format)
  RETURN v_digits;
END;
$$;

-- ============================================================
-- 6. match_call_to_lead function
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_call_to_lead(
  p_normalized_phone text,
  p_caller_id uuid
)
RETURNS TABLE(lead_id uuid, product_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result_lead_id uuid;
  v_result_product_id uuid;
  v_match_count int;
BEGIN
  IF p_normalized_phone IS NULL OR p_caller_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Priority 1: active lead assigned to this caller with matching normalized phone
  SELECT l.id, l.product_id INTO v_result_lead_id, v_result_product_id
  FROM public.leads l
  WHERE public.normalize_phone_number(l.phone) = p_normalized_phone
    AND l.current_caller_id = p_caller_id
    AND l.is_active = true
  ORDER BY l.updated_at DESC
  LIMIT 1;

  IF v_result_lead_id IS NOT NULL THEN
    RETURN QUERY SELECT v_result_lead_id, v_result_product_id;
    RETURN;
  END IF;

  -- Priority 2: any lead with matching phone whose product is in the caller's
  -- active product assignments (caller_queues)
  SELECT l.id, l.product_id INTO v_result_lead_id, v_result_product_id
  FROM public.leads l
  WHERE public.normalize_phone_number(l.phone) = p_normalized_phone
    AND l.is_active = true
    AND l.product_id IN (
      SELECT cq.product_id
      FROM public.caller_queues cq
      WHERE cq.employee_id = p_caller_id
        AND cq.is_active = true
    )
  ORDER BY l.updated_at DESC
  LIMIT 1;

  IF v_result_lead_id IS NOT NULL THEN
    RETURN QUERY SELECT v_result_lead_id, v_result_product_id;
    RETURN;
  END IF;

  -- Priority 3: any active lead with matching phone — only if exactly one match
  SELECT count(*) INTO v_match_count
  FROM public.leads l
  WHERE public.normalize_phone_number(l.phone) = p_normalized_phone
    AND l.is_active = true;

  IF v_match_count = 1 THEN
    SELECT l.id, l.product_id INTO v_result_lead_id, v_result_product_id
    FROM public.leads l
    WHERE public.normalize_phone_number(l.phone) = p_normalized_phone
      AND l.is_active = true
    LIMIT 1;

    RETURN QUERY SELECT v_result_lead_id, v_result_product_id;
    RETURN;
  END IF;

  -- No safe match
  RETURN QUERY SELECT NULL::uuid, NULL::uuid;
END;
$$;

-- ============================================================
-- 7. insert_synced_call function
-- ============================================================
CREATE OR REPLACE FUNCTION public.insert_synced_call(
  p_caller_id uuid,
  p_phone_number text,
  p_direction text DEFAULT 'OUTGOING',
  p_call_status text DEFAULT 'COMPLETED',
  p_duration_seconds integer DEFAULT 0,
  p_call_timestamp timestamptz DEFAULT now(),
  p_outcome text DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_external_call_id text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_sync_source text DEFAULT 'ANDROID'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_phone text;
  v_lead_id uuid;
  v_product_id uuid;
  v_exists boolean;
  v_inserted_id uuid;
BEGIN
  -- Normalize the phone number
  v_normalized_phone := public.normalize_phone_number(p_phone_number);

  -- Match to a lead (does NOT modify leads)
  SELECT ml.lead_id, ml.product_id INTO v_lead_id, v_product_id
  FROM public.match_call_to_lead(v_normalized_phone, p_caller_id) AS ml;

  -- Check for duplicate using the same dedup key as the unique index
  SELECT EXISTS (
    SELECT 1 FROM public.call_history
    WHERE COALESCE(caller_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_caller_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(normalized_phone, '') = COALESCE(v_normalized_phone, '')
      AND call_timestamp = p_call_timestamp
      AND direction = p_direction
  ) INTO v_exists;

  IF v_exists THEN
    RETURN json_build_object('status', 'duplicate', 'lead_id', v_lead_id, 'product_id', v_product_id);
  END IF;

  -- Insert the call record
  INSERT INTO public.call_history (
    caller_id, phone_number, normalized_phone, direction, call_status,
    duration_seconds, call_timestamp, outcome, remarks,
    lead_id, product_id, external_call_id, device_id, sync_source, synced_at,
    is_simulated
  ) VALUES (
    p_caller_id, p_phone_number, v_normalized_phone, p_direction, p_call_status,
    p_duration_seconds, p_call_timestamp, p_outcome, p_remarks,
    v_lead_id, v_product_id, p_external_call_id, p_device_id, p_sync_source, now(),
    false
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN json_build_object('status', 'inserted', 'id', v_inserted_id, 'lead_id', v_lead_id, 'product_id', v_product_id);
  ELSE
    RETURN json_build_object('status', 'duplicate', 'lead_id', v_lead_id, 'product_id', v_product_id);
  END IF;
END;
$$;

-- ============================================================
-- 8. Grant execute on new functions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.normalize_phone_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_call_to_lead(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_synced_call(uuid, text, text, text, integer, timestamptz, text, text, text, text, text) TO authenticated;
