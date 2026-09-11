/*
# Module 13.5 — Employee Product+City Assignment, City-wise Caller Queue, Car QR Codes, Payment Enhancements, Lead Source

## Summary
1. Add `source` column to `leads` table for tracking lead origin (Showroom Data, ANFT, Dealer, etc.)
2. Create `employee_product_cities` table for employee/product/city assignments (one employee can be in multiple cities per product)
3. Add `city_id` to `caller_queues` table to make queues product+city-wise
4. Create `car_qr_codes` table for multiple active CAR payment QR codes
5. Add `service_description`, `payment_mode`, `qr_id`, `collected_by` columns to `payment_records`
6. Update `assign_new_lead` and `rotate_to_next_caller` functions to filter by product+city
7. Add RLS policies for new tables and updated columns

## New Tables
- `employee_product_cities`: Maps employees to product+city combinations. Unique on (employee_id, product_id, city_id).
- `car_qr_codes`: Stores multiple QR code images for CAR product. Each has name, image URL, active status.

## Modified Tables
- `leads`: Added `source` text column (nullable) for lead origin tracking
- `caller_queues`: Added `city_id` uuid column referencing product_cities (nullable for backward compat)
- `payment_records`: Added `service_description` text, `payment_mode` text, `qr_id` uuid, `collected_by` uuid

## Security
- RLS enabled on all new tables
- employee_product_cities: Admin full CRUD, Manager read for assigned products, Employee read own assignments
- car_qr_codes: Admin full CRUD, authenticated read active QR codes
- payment_records: existing policies preserved, new columns don't change access patterns
*/

-- 1. Add source column to leads
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'source') THEN
    ALTER TABLE public.leads ADD COLUMN source text;
  END IF;
END $$;

-- 2. Create employee_product_cities table
CREATE TABLE IF NOT EXISTS public.employee_product_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.product_cities(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, product_id, city_id)
);

CREATE INDEX IF NOT EXISTS idx_epc_employee ON public.employee_product_cities(employee_id);
CREATE INDEX IF NOT EXISTS idx_epc_product_city ON public.employee_product_cities(product_id, city_id);
CREATE INDEX IF NOT EXISTS idx_epc_active ON public.employee_product_cities(is_active) WHERE is_active = true;

ALTER TABLE public.employee_product_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epc_admin_select" ON public.employee_product_cities;
CREATE POLICY "epc_admin_select" ON public.employee_product_cities
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "epc_admin_insert" ON public.employee_product_cities;
CREATE POLICY "epc_admin_insert" ON public.employee_product_cities
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "epc_admin_update" ON public.employee_product_cities;
CREATE POLICY "epc_admin_update" ON public.employee_product_cities
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "epc_admin_delete" ON public.employee_product_cities;
CREATE POLICY "epc_admin_delete" ON public.employee_product_cities
  FOR DELETE TO authenticated USING (public.is_admin());

-- Manager can read assignments for their assigned products
DROP POLICY IF EXISTS "epc_manager_select" ON public.employee_product_cities;
CREATE POLICY "epc_manager_select" ON public.employee_product_cities
  FOR SELECT TO authenticated
  USING (public.is_manager() AND product_id = ANY(public.assigned_product_ids()));

-- Employee can read their own assignments
DROP POLICY IF EXISTS "epc_self_select" ON public.employee_product_cities;
CREATE POLICY "epc_self_select" ON public.employee_product_cities
  FOR SELECT TO authenticated
  USING (auth.uid() = employee_id);

-- 3. Add city_id to caller_queues
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caller_queues' AND column_name = 'city_id') THEN
    ALTER TABLE public.caller_queues ADD COLUMN city_id uuid REFERENCES public.product_cities(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cq_city ON public.caller_queues(city_id);
CREATE INDEX IF NOT EXISTS idx_cq_product_city ON public.caller_queues(product_id, city_id) WHERE is_active = true;

-- 4. Create car_qr_codes table
CREATE TABLE IF NOT EXISTS public.car_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qr_name text NOT NULL,
  qr_image_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_product_active ON public.car_qr_codes(product_id, is_active);

ALTER TABLE public.car_qr_codes ENABLE ROW LEVEL SECURITY;

-- Admin full CRUD
DROP POLICY IF EXISTS "qr_admin_select" ON public.car_qr_codes;
CREATE POLICY "qr_admin_select" ON public.car_qr_codes
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "qr_admin_insert" ON public.car_qr_codes;
CREATE POLICY "qr_admin_insert" ON public.car_qr_codes
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "qr_admin_update" ON public.car_qr_codes;
CREATE POLICY "qr_admin_update" ON public.car_qr_codes
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "qr_admin_delete" ON public.car_qr_codes;
CREATE POLICY "qr_admin_delete" ON public.car_qr_codes
  FOR DELETE TO authenticated USING (public.is_admin());

-- Manager can read QR codes for assigned products
DROP POLICY IF EXISTS "qr_manager_select" ON public.car_qr_codes;
CREATE POLICY "qr_manager_select" ON public.car_qr_codes
  FOR SELECT TO authenticated
  USING (public.is_manager() AND product_id = ANY(public.assigned_product_ids()));

-- Employee can read active QR codes for their product
DROP POLICY IF EXISTS "qr_employee_select" ON public.car_qr_codes;
CREATE POLICY "qr_employee_select" ON public.car_qr_codes
  FOR SELECT TO authenticated
  USING (is_active = true);

-- 5. Add columns to payment_records
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_records' AND column_name = 'service_description') THEN
    ALTER TABLE public.payment_records ADD COLUMN service_description text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_records' AND column_name = 'payment_mode') THEN
    ALTER TABLE public.payment_records ADD COLUMN payment_mode text NOT NULL DEFAULT 'CASH';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_records' AND column_name = 'qr_id') THEN
    ALTER TABLE public.payment_records ADD COLUMN qr_id uuid REFERENCES public.car_qr_codes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payment_records' AND column_name = 'collected_by') THEN
    ALTER TABLE public.payment_records ADD COLUMN collected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Update assign_new_lead to filter by product+city
CREATE OR REPLACE FUNCTION public.assign_new_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_caller_id uuid;
  v_city_id uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;

  -- Find city_id from product_cities matching the lead's city name
  SELECT id INTO v_city_id FROM public.product_cities
  WHERE product_id = v_lead.product_id AND city_name = v_lead.city AND is_active = true
  LIMIT 1;

  -- First active caller in the product+city queue, lowest priority first.
  -- Falls back to product-only queue if city_id is null or no city-specific queue exists.
  SELECT cq.employee_id INTO v_caller_id
  FROM public.caller_queues cq
  JOIN public.profiles p ON p.id = cq.employee_id
  WHERE cq.product_id = v_lead.product_id
  AND cq.is_active = true
  AND p.is_active = true
  AND (
    (v_city_id IS NOT NULL AND cq.city_id = v_city_id)
    OR
    (v_city_id IS NOT NULL AND cq.city_id IS NULL)
    OR
    (v_city_id IS NULL)
  )
  ORDER BY
    CASE WHEN cq.city_id = v_city_id THEN 0 ELSE 1 END,
    cq.priority ASC,
    cq.created_at ASC
  LIMIT 1;

  IF v_caller_id IS NULL THEN
    UPDATE public.leads
    SET status = 'ADMIN_REVIEW', in_admin_review = true,
    current_caller_id = NULL, assigned_at = now()
    WHERE id = p_lead_id;
    INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
    new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
    v_lead.status, 'ADMIN_REVIEW', 'INITIAL_ASSIGNMENT', 'SYSTEM', NULL, 0,
    'No active caller in queue');
    RETURN NULL;
  END IF;

  UPDATE public.leads
  SET current_caller_id = v_caller_id, assigned_at = now(), status = 'NEW'
  WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
  (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
  new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_caller_id,
  v_lead.status, 'NEW', 'INITIAL_ASSIGNMENT', 'SYSTEM', auth.uid(), 0, 'Initial assignment');

  RETURN v_caller_id;
END;
$function$;

-- 7. Update rotate_to_next_caller to filter by product+city
CREATE OR REPLACE FUNCTION public.rotate_to_next_caller(p_lead_id uuid, p_reason text, p_actor_type text DEFAULT 'SYSTEM', p_actor_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_current_priority int;
  v_next_caller_id uuid;
  v_city_id uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Find city_id
  SELECT id INTO v_city_id FROM public.product_cities
  WHERE product_id = v_lead.product_id AND city_name = v_lead.city AND is_active = true
  LIMIT 1;

  -- Current caller's priority in this product's queue.
  SELECT priority INTO v_current_priority
  FROM public.caller_queues
  WHERE product_id = v_lead.product_id AND employee_id = v_lead.current_caller_id
  LIMIT 1;

  -- Next active caller with strictly greater priority (NO wrap-around).
  -- Prefer city-specific callers first, then product-wide callers.
  SELECT cq.employee_id INTO v_next_caller_id
  FROM public.caller_queues cq
  JOIN public.profiles p ON p.id = cq.employee_id
  WHERE cq.product_id = v_lead.product_id
  AND cq.is_active = true
  AND p.is_active = true
  AND cq.priority > COALESCE(v_current_priority, -1)
  AND (
    (v_city_id IS NOT NULL AND cq.city_id = v_city_id)
    OR
    (v_city_id IS NOT NULL AND cq.city_id IS NULL)
    OR
    (v_city_id IS NULL)
  )
  ORDER BY
    CASE WHEN cq.city_id = v_city_id THEN 0 ELSE 1 END,
    cq.priority ASC,
    cq.created_at ASC
  LIMIT 1;

  IF v_next_caller_id IS NULL THEN
    UPDATE public.leads
    SET status = 'ADMIN_REVIEW', in_admin_review = true,
    current_caller_id = NULL, rotation_count = rotation_count + 1,
    next_followup_at = NULL
    WHERE id = p_lead_id;
    INSERT INTO public.lead_assignments
    (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
    new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, NULL,
    v_lead.status, 'ADMIN_REVIEW', p_reason, p_actor_type, p_actor_id,
    v_lead.rotation_count + 1, 'No next active caller; moved to Admin Review');
    INSERT INTO public.lead_status_history
    (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
    VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_lead.status, 'ADMIN_REVIEW',
    'Auto: no next caller', p_actor_type, p_actor_id);
    RETURN NULL;
  END IF;

  UPDATE public.leads
  SET current_caller_id = v_next_caller_id,
  status = 'NEW',
  rotation_count = rotation_count + 1,
  assigned_at = now(),
  last_contact_at = NULL,
  next_followup_at = NULL,
  in_admin_review = false
  WHERE id = p_lead_id;

  INSERT INTO public.lead_assignments
  (lead_id, product_id, previous_caller_id, new_caller_id, previous_status,
  new_status, assignment_reason, actor_type, actor_id, attempt_number, remarks)
  VALUES (p_lead_id, v_lead.product_id, v_lead.current_caller_id, v_next_caller_id,
  v_lead.status, 'NEW', p_reason, p_actor_type, p_actor_id,
  v_lead.rotation_count + 1, 'Rotation');
  INSERT INTO public.lead_status_history
  (lead_id, product_id, employee_id, previous_status, new_status, remarks, actor_type, actor_id)
  VALUES (p_lead_id, v_lead.product_id, v_next_caller_id, v_lead.status, 'NEW',
  'Auto rotation: ' || p_reason, p_actor_type, p_actor_id);

  RETURN v_next_caller_id;
END;
$function$;

-- 8. Add manager INSERT/UPDATE/DELETE on caller_queues for assigned products
DROP POLICY IF EXISTS "caller_queues_manager_insert" ON public.caller_queues;
CREATE POLICY "caller_queues_manager_insert" ON public.caller_queues
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager() AND product_id = ANY(public.assigned_product_ids()));

DROP POLICY IF EXISTS "caller_queues_manager_update" ON public.caller_queues;
CREATE POLICY "caller_queues_manager_update" ON public.caller_queues
  FOR UPDATE TO authenticated
  USING (public.is_manager() AND product_id = ANY(public.assigned_product_ids()))
  WITH CHECK (public.is_manager() AND product_id = ANY(public.assigned_product_ids()));

DROP POLICY IF EXISTS "caller_queues_manager_delete" ON public.caller_queues;
CREATE POLICY "caller_queues_manager_delete" ON public.caller_queues
  FOR DELETE TO authenticated
  USING (public.is_manager() AND product_id = ANY(public.assigned_product_ids()));

-- 9. Create storage bucket for QR codes (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for qr-codes bucket
DROP POLICY IF EXISTS "qr_codes_admin_upload" ON storage.objects;
CREATE POLICY "qr_codes_admin_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_public_read" ON storage.objects;
CREATE POLICY "qr_codes_public_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_admin_update" ON storage.objects;
CREATE POLICY "qr_codes_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND bucket_id = 'qr-codes')
  WITH CHECK (public.is_admin() AND bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_codes_admin_delete" ON storage.objects;
CREATE POLICY "qr_codes_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (public.is_admin() AND bucket_id = 'qr-codes');
