/*
# Recreate two missing RPCs: call_history_stats and admin_edit_lead

## Purpose
Both RPCs were called by the frontend but were missing from the remote database.
This migration recreates them, adapted to the CURRENT database schema.

## 1. call_history_stats
- Recreated from the original migration (20260909052905) unchanged.
- Reads from `call_history` table — all columns referenced still exist.
- Returns a single JSON row: total, incoming, outgoing, answered, missed, rejected, declined, no_answer, total_duration_seconds.
- SECURITY DEFINER, read-only aggregate.

## 2. admin_edit_lead
- Adapted from the original migration (20260901133451) to match the current schema:
  - Uses `log_audit()` instead of `write_audit_log()` (which no longer exists).
  - Inserts into `lead_status_history` using NEW column names:
    `old_status_id`, `new_status_id`, `changed_by`, `note` (instead of the old
    `employee_id`, `previous_status`, `new_status`, `actor_type`, `actor_id`).
  - Looks up status UUIDs from the `statuses` table using `lower(p_status)`.
- Updates: name, phone, product_id, status, current_caller_id, remarks.
- Preserves rotation_count, assigned_at, last_contact_at, next_followup_at, in_admin_review.
- SECURITY DEFINER, admin-only via `is_admin()` check.
- Also updates `assigned_caller_id` to mirror `current_caller_id` for NEW-schema compatibility.
- The `mobile` column is synced from `phone` by an existing trigger.

## Security
- Both functions are SECURITY DEFINER with `search_path = public`.
- `admin_edit_lead` checks `is_admin()` before proceeding.
- `call_history_stats` returns only aggregate counts, no individual row data.
- Both granted to `authenticated` role only.

## Important Notes
1. No tables, columns, RLS policies, or triggers are modified.
2. No data is changed.
3. Both functions use `CREATE OR REPLACE` so they are safe to re-run.
*/

-- ============ call_history_stats ============
CREATE OR REPLACE FUNCTION public.call_history_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_caller_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_direction text DEFAULT NULL,
  p_call_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'total', COUNT(*),
    'incoming', COUNT(*) FILTER (WHERE direction = 'INCOMING'),
    'outgoing', COUNT(*) FILTER (WHERE direction = 'OUTGOING'),
    'answered', COUNT(*) FILTER (WHERE call_status = 'ANSWERED'),
    'missed', COUNT(*) FILTER (WHERE call_status IN ('MISSED', 'NO_ANSWER')),
    'rejected', COUNT(*) FILTER (WHERE call_status = 'REJECTED'),
    'declined', COUNT(*) FILTER (WHERE call_status = 'DECLINED'),
    'no_answer', COUNT(*) FILTER (WHERE call_status = 'NO_ANSWER'),
    'total_duration_seconds', COALESCE(SUM(duration_seconds), 0)
  )
  FROM public.call_history
  WHERE call_timestamp >= p_from
    AND call_timestamp <= p_to
    AND (p_caller_id IS NULL OR caller_id = p_caller_id)
    AND (p_product_id IS NULL OR product_id = p_product_id)
    AND (p_direction IS NULL OR p_direction = 'all' OR direction = p_direction)
    AND (
      p_call_status IS NULL OR p_call_status = 'all' OR
      (p_call_status = 'MISSED' AND call_status IN ('MISSED', 'NO_ANSWER')) OR
      (p_call_status <> 'MISSED' AND call_status = p_call_status)
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      phone_number ILIKE '%' || p_search || '%' OR
      external_call_id ILIKE '%' || p_search || '%'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.call_history_stats(timestamptz, timestamptz, uuid, uuid, text, text, text) TO authenticated;

-- ============ admin_edit_lead ============
CREATE OR REPLACE FUNCTION public.admin_edit_lead(
  p_lead_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_current_caller_id uuid DEFAULT NULL,
  p_remarks text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_changes jsonb := '{}'::jsonb;
  v_old_status_id uuid;
  v_new_status_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  -- Build update dynamically, tracking what changed for audit.
  IF p_name IS NOT NULL AND p_name <> v_lead.name THEN
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(v_lead.name, p_name));
    UPDATE public.leads SET name = p_name WHERE id = p_lead_id;
  END IF;

  IF p_phone IS NOT NULL AND p_phone <> COALESCE(v_lead.phone, '') THEN
    v_changes := v_changes || jsonb_build_object('phone', jsonb_build_array(v_lead.phone, p_phone));
    UPDATE public.leads SET phone = p_phone WHERE id = p_lead_id;
  END IF;

  IF p_product_id IS NOT NULL AND p_product_id <> v_lead.product_id THEN
    v_changes := v_changes || jsonb_build_object('product_id', jsonb_build_array(v_lead.product_id, p_product_id));
    UPDATE public.leads SET product_id = p_product_id WHERE id = p_lead_id;
  END IF;

  IF p_status IS NOT NULL AND p_status <> COALESCE(v_lead.status, '') THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_array(v_lead.status, p_status));
    UPDATE public.leads SET status = p_status WHERE id = p_lead_id;

    -- Insert status history using current schema columns.
    SELECT id INTO v_new_status_id FROM public.statuses WHERE code = lower(p_status) LIMIT 1;
    IF v_lead.status IS NOT NULL THEN
      SELECT id INTO v_old_status_id FROM public.statuses WHERE code = lower(v_lead.status) LIMIT 1;
    END IF;
    IF v_new_status_id IS NOT NULL THEN
      INSERT INTO public.lead_status_history
        (lead_id, old_status_id, new_status_id, changed_by, note)
      VALUES (p_lead_id, v_old_status_id, v_new_status_id, auth.uid(), 'Admin edit');
    END IF;
  END IF;

  IF p_current_caller_id IS DISTINCT FROM v_lead.current_caller_id THEN
    v_changes := v_changes || jsonb_build_object('current_caller_id',
      jsonb_build_array(v_lead.current_caller_id, p_current_caller_id));
    -- Update both OLD and NEW caller columns for compatibility.
    UPDATE public.leads
      SET current_caller_id = p_current_caller_id,
          assigned_caller_id = p_current_caller_id
      WHERE id = p_lead_id;
  END IF;

  IF p_remarks IS NOT NULL AND p_remarks <> COALESCE(v_lead.remarks, '') THEN
    v_changes := v_changes || jsonb_build_object('remarks', jsonb_build_array(v_lead.remarks, p_remarks));
    UPDATE public.leads SET remarks = p_remarks WHERE id = p_lead_id;
  END IF;

  PERFORM public.log_audit(
    'LEAD_EDIT', 'lead', p_lead_id::text, v_changes, NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_edit_lead(uuid, text, text, uuid, text, uuid, text) TO authenticated;
