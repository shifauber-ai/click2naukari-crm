/*
# Admin Permanent Lead Deletion

## Purpose
Replace soft-delete with true permanent deletion for Admin → All Leads.
When an admin deletes a lead (single or bulk), the lead row and all exclusively-owned
child records are permanently removed from the database.

## What This Migration Does

### 1. New Functions
- `admin_permanent_delete_lead(p_lead_id uuid)` — permanently deletes a single lead.
  - Admin-only (uses existing `is_admin()` check).
  - Cancels pending scheduled transitions first (via `cancel_pending_transitions`).
  - Hard-deletes the lead row. All child tables with `ON DELETE CASCADE` are
    automatically cleaned up: issues, lead_assignments, lead_platform_status,
    lead_status_history, notifications, other_hero_leads, scheduled_transitions.
  - Tables with `ON DELETE SET NULL` (call_history, directory_entries,
    payment_records, import_records) have their `lead_id` set to NULL — the
    rows remain but are detached from the deleted lead.
  - Writes an audit log entry before deletion.

- `admin_bulk_permanent_delete_leads(p_lead_ids uuid[])` — efficiently deletes
  multiple leads in a single call.
  - Admin-only.
  - Cancels pending transitions for all leads.
  - Writes audit log entries for all leads.
  - Hard-deletes all leads in one `DELETE` statement.
  - Returns `{ deleted_count: int, not_found_count: int }`.

### 2. Security
- Both functions are `SECURITY DEFINER` with `search_path = 'public'`.
- Both check `is_admin()` and raise 'Admin only' if the caller is not an admin.
- No RLS policy changes — the functions run with definer privileges but
  gate access via the explicit `is_admin()` check.

### 3. Important Notes
- This is a HARD DELETE — the lead row is permanently removed.
- There is no soft-delete fallback and no archive table.
- Shared/reference data (products, profiles, platforms, etc.) is not affected.
- The existing `admin_soft_delete_lead` function is left in place for any
  other code paths that may still reference it.
*/

-- Single permanent delete
CREATE OR REPLACE FUNCTION public.admin_permanent_delete_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- Cancel any pending scheduled transitions for this lead
  PERFORM public.cancel_pending_transitions(p_lead_id);

  -- Write audit log before the row is gone
  PERFORM public.write_audit_log(
    'LEAD_DELETE',
    'lead',
    p_lead_id::text,
    jsonb_build_object('permanent_delete', true)
  );

  -- Hard delete — CASCADE removes: issues, lead_assignments, lead_platform_status,
  -- lead_status_history, notifications, other_hero_leads, scheduled_transitions
  -- SET NULL detaches: call_history, directory_entries, payment_records, import_records
  DELETE FROM public.leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
END;
$$;

-- Bulk permanent delete — single efficient operation
CREATE OR REPLACE FUNCTION public.admin_bulk_permanent_delete_leads(p_lead_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_found_ids uuid[];
  v_not_found int;
  v_lead_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- Find which leads actually exist
  SELECT array_agg(id) INTO v_found_ids
  FROM public.leads
  WHERE id = ANY(p_lead_ids);

  v_not_found := array_length(p_lead_ids, 1) - COALESCE(array_length(v_found_ids, 1), 0);

  -- Cancel pending transitions for all found leads
  IF v_found_ids IS NOT NULL THEN
    UPDATE public.scheduled_transitions
    SET status = 'CANCELLED', updated_at = now()
    WHERE lead_id = ANY(v_found_ids) AND status = 'PENDING';

    -- Write audit logs
    FOREACH v_lead_id IN ARRAY v_found_ids LOOP
      PERFORM public.write_audit_log(
        'LEAD_DELETE',
        'lead',
        v_lead_id::text,
        jsonb_build_object('permanent_delete', true, 'bulk', true)
      );
    END LOOP;

    -- Hard delete all in one statement
    DELETE FROM public.leads WHERE id = ANY(v_found_ids);
  END IF;

  RETURN jsonb_build_object(
    'deleted_count', COALESCE(array_length(v_found_ids, 1), 0),
    'not_found_count', v_not_found
  );
END;
$$;

-- Grant execute to authenticated (the is_admin() check gates access)
GRANT EXECUTE ON FUNCTION public.admin_permanent_delete_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_permanent_delete_leads(uuid[]) TO authenticated;
