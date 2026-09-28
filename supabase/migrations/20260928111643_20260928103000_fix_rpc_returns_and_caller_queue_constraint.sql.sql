/*
# Fix: RPC return field names + caller_queues unique constraint

## Problem 1: bulk_import_leads returns wrong field names
Frontend reads `result.imported` and `result.failed` but RPC returns `imported_count` and `skipped_count`.
Frontend reads `result.assigned` and `result.admin_review` from bulk_auto_assign_imported_leads but RPC returns `assigned_count`.

## Fix 1: Update RPC return JSON keys to match frontend expectations

## Problem 2: caller_queues has TWO unique constraints on (product_id, employee_id)
The original DB has `caller_queues_product_id_employee_id_key` and our baseline added `idx_caller_queues_prod_emp`.
The frontend inserts multiple rows per employee (one per city), which violates this constraint.

## Fix 2: Drop both unique constraints on (product_id, employee_id).
The frontend does its own duplicate check before inserting. Multi-city assignments need multiple rows.
*/

-- Fix 1a: Update bulk_import_leads to return frontend-expected field names
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
  v_failed integer := 0;
  v_product_id uuid;
  v_lead_id uuid;
  v_phone text;
  v_existing uuid;
  v_first_error text;
BEGIN
  FOR v_lead IN SELECT * FROM json_array_elements(p_leads) LOOP
    v_product_id := (v_lead->>'product_id')::uuid;
    v_phone := v_lead->>'phone';

    IF v_phone IS NOT NULL AND v_phone != '' THEN
      SELECT id INTO v_existing FROM public.leads WHERE phone = v_phone AND product_id = v_product_id LIMIT 1;
      IF FOUND THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
    END IF;

    BEGIN
      INSERT INTO public.leads (
        name, phone, mobile, product_id, status, remarks, city, platform,
        vehicle_no, dl_no, license_no, form_status, is_active, created_by, created_at, updated_at, source
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
        now(),
        COALESCE(v_lead->>'source', NULL)
      ) RETURNING id INTO v_lead_id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      IF v_first_error IS NULL THEN
        v_first_error := SQLERRM;
      END IF;
    END;
  END LOOP;

  RETURN json_build_object(
    'imported', v_count,
    'failed', v_failed,
    'skipped', v_skipped,
    'first_error', v_first_error
  );
END;
$$;

-- Fix 1b: Update bulk_auto_assign_imported_leads to return frontend-expected field names
CREATE OR REPLACE FUNCTION public.bulk_auto_assign_imported_leads(p_product_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_count integer := 0;
  v_admin_review integer := 0;
  v_result json;
BEGIN
  FOR v_lead IN
    SELECT * FROM public.leads
    WHERE product_id = p_product_id
      AND current_caller_id IS NULL
      AND is_active = true
    ORDER BY created_at ASC
  LOOP
    SELECT public.assign_new_lead(v_lead.id) INTO v_result;
    IF (v_result->>'success')::boolean THEN
      v_count := v_count + 1;
    ELSE
      v_admin_review := v_admin_review + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'assigned', v_count,
    'admin_review', v_admin_review
  );
END;
$$;

-- Fix 2: Drop both unique constraints on caller_queues(product_id, employee_id)
ALTER TABLE public.caller_queues DROP CONSTRAINT IF EXISTS caller_queues_product_id_employee_id_key;
DROP INDEX IF EXISTS public.idx_caller_queues_prod_emp;
