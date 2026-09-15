-- =====================================================
-- 1. Manager INSERT policy on leads (scoped to assigned products)
--    Previously only admins could insert leads, so manager
--    imports silently failed with RLS rejection.
-- =====================================================
CREATE POLICY "leads_manager_insert"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (
    is_manager() AND
    product_id = ANY (assigned_product_ids())
  );

-- =====================================================
-- 2. Manager UPDATE policy on leads (for status updates
--    during import / assign_new_lead fallback)
-- =====================================================
CREATE POLICY "leads_manager_update"
  ON leads FOR UPDATE
  TO authenticated
  USING (
    is_manager() AND
    product_id = ANY (assigned_product_ids())
  )
  WITH CHECK (
    is_manager() AND
    product_id = ANY (assigned_product_ids())
  );

-- =====================================================
-- 3. Bulk lead import RPC
--    Accepts a JSON array of lead rows, inserts them in
--    bulk (bypassing per-row RPC overhead), and calls
--    assign_new_lead for each inserted lead.
--    SECURITY DEFINER so it runs with elevated privileges
--    and avoids N round-trips from the browser.
-- =====================================================
CREATE OR REPLACE FUNCTION public.bulk_import_leads(
  p_leads jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb;
  v_lead_id uuid;
  v_imported int := 0;
  v_failed int := 0;
  v_errors text[] := ARRAY[]::text[];
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_leads)
  LOOP
    BEGIN
      INSERT INTO public.leads (
        name, phone, product_id, platform, city, source,
        status, vehicle_no, dl_no, total_trips, license_no,
        is_active, rotation_count, in_admin_review
      ) VALUES (
        v_row->>'name',
        v_row->>'phone',
        (v_row->>'product_id')::uuid,
        NULLIF(v_row->>'platform', '')::text,
        NULLIF(v_row->>'city', '')::text,
        NULLIF(v_row->>'source', '')::text,
        COALESCE(v_row->>'status', 'NEW'),
        NULLIF(v_row->>'vehicle_no', '')::text,
        NULLIF(v_row->>'dl_no', '')::text,
        CASE WHEN v_row->>'total_trips' IS NULL OR v_row->>'total_trips' = '' THEN NULL
             ELSE (v_row->>'total_trips')::int END,
        NULLIF(v_row->>'license_no', '')::text,
        true, 0, false
      )
      RETURNING id INTO v_lead_id;

      -- Attempt caller assignment; if no caller, lead goes to ADMIN_REVIEW
      PERFORM public.assign_new_lead(v_lead_id);

      v_imported := v_imported + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := array_append(v_errors, SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'imported', v_imported,
    'failed', v_failed,
    'errors', to_jsonb(v_errors)
  );
END;
$function$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.bulk_import_leads(jsonb) TO authenticated;
