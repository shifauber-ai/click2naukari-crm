/*
# 007b — RPC Functions: Bootstrap, Import, Call History, Sync

## Functions

1. bootstrap_profile(p_user_id, p_email, p_full_name, p_role) → json
   - Creates a profile row after auth.users signup
   - Called from frontend register pages and edge function

2. bulk_import_leads(p_leads) → json
   - Bulk inserts leads from import
   - p_leads is a JSON array of lead objects

3. bulk_auto_assign_imported_leads(p_product_id) → json
   - Auto-assigns unassigned leads for a product to available callers

4. call_history_stats(p_from, p_to, p_caller_id, p_product_id, p_direction, p_call_status, p_search) → json
   - Returns aggregated call history statistics

5. insert_synced_call(p_caller_id, p_phone_number, p_direction, p_call_status, p_duration_seconds, p_call_timestamp, p_outcome, p_remarks, p_external_call_id, p_device_id, p_sync_source) → json
   - Inserts a synced call record from Android device
   - Idempotent via external_call_id check
*/

-- Drop existing versions with potentially incompatible signatures
DROP FUNCTION IF EXISTS public.bootstrap_profile(uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.bootstrap_profile(uuid, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.bulk_import_leads(json) CASCADE;
DROP FUNCTION IF EXISTS public.bulk_import_leads(json[]) CASCADE;
DROP FUNCTION IF EXISTS public.bulk_auto_assign_imported_leads(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.call_history_stats(timestamptz, timestamptz, uuid, uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.insert_synced_call(uuid, text, text, text, integer, timestamptz, text, text, text, text, text) CASCADE;

-- === bootstrap_profile ===
CREATE OR REPLACE FUNCTION public.bootstrap_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text DEFAULT '',
  p_role text DEFAULT 'employee'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  -- Map text role to app_role enum
  v_role := CASE
    WHEN lower(p_role) = 'admin' THEN 'admin'::app_role
    WHEN lower(p_role) = 'manager' THEN 'manager'::app_role
    ELSE 'employee'::app_role
  END;

  INSERT INTO public.profiles (id, email, full_name, role, is_active, created_at, updated_at)
  VALUES (p_user_id, p_email, p_full_name, v_role, true, now(), now())
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      updated_at = now();

  RETURN json_build_object('success', true, 'profile_id', p_user_id);
END;
$$;

-- === bulk_import_leads ===
CREATE OR REPLACE FUNCTION public.bulk_import_leads(p_leads json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead json;
  v_count integer := 0;
  v_skipped integer := 0;
  v_product_id uuid;
  v_lead_id uuid;
  v_phone text;
  v_existing uuid;
BEGIN
  FOR v_lead IN SELECT * FROM json_array_elements(p_leads) LOOP
    v_product_id := (v_lead->>'product_id')::uuid;
    v_phone := v_lead->>'phone';

    -- Check for duplicate by phone + product
    IF v_phone IS NOT NULL AND v_phone != '' THEN
      SELECT id INTO v_existing FROM public.leads WHERE phone = v_phone AND product_id = v_product_id LIMIT 1;
      IF FOUND THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.leads (
      name, phone, mobile, product_id, status, remarks, city, platform,
      vehicle_no, dl_no, license_no, form_status, is_active, created_by, created_at, updated_at
    ) VALUES (
      COALESCE(v_lead->>'name', ''),
      COALESCE(v_lead->>'phone', NULL),
      COALESCE(v_lead->>'mobile', NULL),
      v_product_id,
      COALESCE(v_lead->>'status', 'NEW'),
      COALESCE(v_lead->>'remarks', ''),
      COALESCE(v_lead->>'city', ''),
      COALESCE(v_lead->>'platform', ''),
      COALESCE(v_lead->>'vehicle_no', ''),
      COALESCE(v_lead->>'dl_no', ''),
      COALESCE(v_lead->>'license_no', ''),
      COALESCE(v_lead->>'form_status', 'PENDING'),
      true,
      auth.uid(),
      now(),
      now()
    ) RETURNING id INTO v_lead_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'imported_count', v_count, 'skipped_count', v_skipped);
END;
$$;

-- === bulk_auto_assign_imported_leads ===
CREATE OR REPLACE FUNCTION public.bulk_auto_assign_imported_leads(p_product_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_count integer := 0;
BEGIN
  FOR v_lead IN
    SELECT * FROM public.leads
    WHERE product_id = p_product_id
      AND current_caller_id IS NULL
      AND is_active = true
    ORDER BY created_at ASC
  LOOP
    PERFORM public.assign_new_lead(v_lead.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'assigned_count', v_count);
END;
$$;

-- === call_history_stats ===
CREATE OR REPLACE FUNCTION public.call_history_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_caller_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_direction text DEFAULT NULL,
  p_call_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'total_calls', count(*),
    'answered', count(*) FILTER (WHERE call_status = 'ANSWERED'),
    'not_answered', count(*) FILTER (WHERE call_status = 'NOT_ANSWERED'),
    'outgoing', count(*) FILTER (WHERE direction = 'OUTGOING'),
    'incoming', count(*) FILTER (WHERE direction = 'INCOMING'),
    'avg_duration', COALESCE(avg(duration_seconds), 0)
  ) INTO v_result
  FROM public.call_history
  WHERE (p_from IS NULL OR call_timestamp >= p_from)
    AND (p_to IS NULL OR call_timestamp <= p_to)
    AND (p_caller_id IS NULL OR caller_id = p_caller_id)
    AND (p_product_id IS NULL OR product_id = p_product_id)
    AND (p_direction IS NULL OR direction = p_direction)
    AND (p_call_status IS NULL OR call_status = p_call_status)
    AND (p_search IS NULL OR phone_number ILIKE '%' || p_search || '%');

  RETURN v_result;
END;
$$;

-- === insert_synced_call ===
CREATE OR REPLACE FUNCTION public.insert_synced_call(
  p_caller_id uuid,
  p_phone_number text,
  p_direction text DEFAULT 'OUTGOING',
  p_call_status text DEFAULT '',
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
  v_existing uuid;
  v_call_id uuid;
  v_lead RECORD;
  v_normalized text;
BEGIN
  -- Idempotency check via external_call_id
  IF p_external_call_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.call_history WHERE external_call_id = p_external_call_id LIMIT 1;
    IF FOUND THEN
      RETURN json_build_object('success', true, 'call_id', v_existing, 'duplicate', true);
    END IF;
  END IF;

  -- Normalize phone (strip non-digits, take last 10)
  v_normalized := regexp_replace(COALESCE(p_phone_number, ''), '[^0-9]', '', 'g');
  IF length(v_normalized) > 10 THEN
    v_normalized := right(v_normalized, 10);
  END IF;

  -- Try to find a matching lead by phone
  SELECT * INTO v_lead
  FROM public.leads
  WHERE phone = p_phone_number
     OR regexp_replace(phone, '[^0-9]', '', 'g') = v_normalized
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.call_history (
    lead_id, product_id, phone_number, normalized_phone, direction, call_status,
    duration_seconds, outcome, remarks, is_simulated, caller_id, call_timestamp,
    external_call_id, device_id, sync_source, synced_at, created_at
  ) VALUES (
    v_lead.id, v_lead.product_id, p_phone_number, v_normalized, p_direction, p_call_status,
    p_duration_seconds, p_outcome, p_remarks, false, p_caller_id, p_call_timestamp,
    p_external_call_id, p_device_id, p_sync_source, now(), now()
  ) RETURNING id INTO v_call_id;

  RETURN json_build_object('success', true, 'call_id', v_call_id, 'duplicate', false);
END;
$$;
