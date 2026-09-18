-- Fix: admin_bulk_permanent_delete_leads referenced non-existent column "updated_at"
-- on scheduled_transitions. The table has "processed_at", not "updated_at".
-- This caused the entire RPC to fail with:
--   ERROR: column "updated_at" of relation "scheduled_transitions" does not exist

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

  IF v_found_ids IS NOT NULL THEN
    -- Cancel pending transitions (use processed_at, not updated_at — that column doesn't exist)
    UPDATE public.scheduled_transitions
    SET status = 'CANCELLED', processed_at = now()
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
    -- CASCADE removes: issues, lead_assignments, lead_platform_status,
    -- lead_status_history, notifications, other_hero_leads, scheduled_transitions
    -- SET NULL detaches: call_history, directory_entries, payment_records, import_records
    DELETE FROM public.leads WHERE id = ANY(v_found_ids);
  END IF;

  RETURN jsonb_build_object(
    'deleted_count', COALESCE(array_length(v_found_ids, 1), 0),
    'not_found_count', v_not_found
  );
END;
$$;

-- Re-grant execute (CREATE OR REPLACE preserves grants, but be explicit)
GRANT EXECUTE ON FUNCTION public.admin_bulk_permanent_delete_leads(uuid[]) TO authenticated;
