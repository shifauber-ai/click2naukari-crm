-- Admin permanent lead deletion (single + bulk)
-- SECURITY DEFINER, gated by is_admin() check.
-- Handles NO ACTION FK constraints by detaching references before hard delete.

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

  -- Detach NO ACTION references so the hard delete succeeds
  UPDATE public.payments SET lead_id = NULL WHERE lead_id = p_lead_id;
  UPDATE public.import_rows SET lead_id = NULL WHERE lead_id = p_lead_id;
  UPDATE public.import_duplicates SET existing_lead_id = NULL WHERE existing_lead_id = p_lead_id;
  UPDATE public.directory_records SET converted_to_lead_id = NULL WHERE converted_to_lead_id = p_lead_id;

  -- Write audit log before the row is gone
  PERFORM public.log_audit(
    'LEAD_DELETE',
    'lead',
    p_lead_id::text,
    jsonb_build_object('permanent_delete', true)
  );

  -- Hard delete — CASCADE removes: issues, lead_assignments, lead_platform_status,
  -- lead_status_history, follow_ups, caller_assignment_history, other_hero, other_hero_leads,
  -- scheduled_transitions, lead_notes
  -- SET NULL detaches: call_history, directory_entries, payment_records
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

  IF v_found_ids IS NOT NULL THEN
    -- Detach NO ACTION references so the hard delete succeeds
    UPDATE public.payments SET lead_id = NULL WHERE lead_id = ANY(v_found_ids);
    UPDATE public.import_rows SET lead_id = NULL WHERE lead_id = ANY(v_found_ids);
    UPDATE public.import_duplicates SET existing_lead_id = NULL WHERE existing_lead_id = ANY(v_found_ids);
    UPDATE public.directory_records SET converted_to_lead_id = NULL WHERE converted_to_lead_id = ANY(v_found_ids);

    -- Write audit logs
    FOREACH v_lead_id IN ARRAY v_found_ids LOOP
      PERFORM public.log_audit(
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
