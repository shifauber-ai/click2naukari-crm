/*
# 006 — Row Level Security Policies

## Purpose
Implements secure RLS for all CRM tables with proper admin/manager/employee role separation.

## Security Model

### ADMIN
- Full CRUD access to all tables

### MANAGER
- Access only to products assigned via manager_product_assignments
- Can read/write all data within their assigned products

### EMPLOYEE
- Access only to leads/products assigned via caller_queues and employee_product_cities
- Can read leads where they are the current_caller_id
- Can insert/update their own call_history, issues, other_hero_leads, payment_records

## Notes
- Uses helper functions: is_admin(), is_manager_of_product(), is_employee_of_product(), employee_product_ids(), manager_product_ids()
- Policies use 4 separate statements per table (SELECT, INSERT, UPDATE, DELETE)
- Drop-first pattern for idempotency
*/

-- Helper: employee can access a lead if they are the current caller
CREATE OR REPLACE FUNCTION public.is_lead_caller(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id AND current_caller_id = auth.uid()
  );
$$;

-- Helper: employee can access data for a product if assigned
CREATE OR REPLACE FUNCTION public.employee_can_access_product(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.caller_queues cq
    WHERE cq.employee_id = auth.uid() AND cq.product_id = p_product_id AND cq.is_active = true
  )
  OR EXISTS (
    SELECT 1 FROM public.manager_product_assignments mpa
    WHERE mpa.manager_id = auth.uid() AND mpa.product_id = p_product_id
  );
$$;

-- === profiles ===
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
TO authenticated USING (
  public.is_admin() OR id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.manager_product_assignments mpa
    JOIN public.caller_queues cq ON cq.product_id = mpa.product_id
    WHERE mpa.manager_id = auth.uid() AND cq.employee_id = profiles.id
  )
  OR EXISTS (
    SELECT 1 FROM public.caller_queues cq
    WHERE cq.employee_id = auth.uid() AND cq.product_id IN (
      SELECT cq2.product_id FROM public.caller_queues cq2 WHERE cq2.employee_id = profiles.id
    )
  )
);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
TO authenticated USING (
  public.is_admin() OR id = auth.uid()
) WITH CHECK (
  public.is_admin() OR id = auth.uid()
);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE
TO authenticated USING (public.is_admin());

-- === products ===
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products FOR SELECT
TO authenticated USING (
  public.is_admin()
  OR id IN (SELECT public.manager_product_ids())
  OR id IN (SELECT public.employee_product_ids())
);

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products FOR DELETE
TO authenticated USING (public.is_admin());

-- === platforms ===
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platforms_select" ON public.platforms;
CREATE POLICY "platforms_select" ON public.platforms FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "platforms_insert" ON public.platforms;
CREATE POLICY "platforms_insert" ON public.platforms FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "platforms_update" ON public.platforms;
CREATE POLICY "platforms_update" ON public.platforms FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "platforms_delete" ON public.platforms;
CREATE POLICY "platforms_delete" ON public.platforms FOR DELETE
TO authenticated USING (public.is_admin());

-- === product_cities ===
ALTER TABLE public.product_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_cities_select" ON public.product_cities;
CREATE POLICY "product_cities_select" ON public.product_cities FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR public.is_employee_of_product(product_id)
);

DROP POLICY IF EXISTS "product_cities_insert" ON public.product_cities;
CREATE POLICY "product_cities_insert" ON public.product_cities FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "product_cities_update" ON public.product_cities;
CREATE POLICY "product_cities_update" ON public.product_cities FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "product_cities_delete" ON public.product_cities;
CREATE POLICY "product_cities_delete" ON public.product_cities FOR DELETE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id));

-- === product_platforms ===
ALTER TABLE public.product_platforms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_platforms_select" ON public.product_platforms;
CREATE POLICY "product_platforms_select" ON public.product_platforms FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR public.is_employee_of_product(product_id)
);

DROP POLICY IF EXISTS "product_platforms_insert" ON public.product_platforms;
CREATE POLICY "product_platforms_insert" ON public.product_platforms FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "product_platforms_update" ON public.product_platforms;
CREATE POLICY "product_platforms_update" ON public.product_platforms FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "product_platforms_delete" ON public.product_platforms;
CREATE POLICY "product_platforms_delete" ON public.product_platforms FOR DELETE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id));

-- === caller_queues ===
ALTER TABLE public.caller_queues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caller_queues_select" ON public.caller_queues;
CREATE POLICY "caller_queues_select" ON public.caller_queues FOR SELECT
TO authenticated USING (
  public.is_admin()
  OR employee_id = auth.uid()
  OR product_id IN (SELECT public.manager_product_ids())
);

DROP POLICY IF EXISTS "caller_queues_insert" ON public.caller_queues;
CREATE POLICY "caller_queues_insert" ON public.caller_queues FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "caller_queues_update" ON public.caller_queues;
CREATE POLICY "caller_queues_update" ON public.caller_queues FOR UPDATE
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
) WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "caller_queues_delete" ON public.caller_queues;
CREATE POLICY "caller_queues_delete" ON public.caller_queues FOR DELETE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id));

-- === caller_devices ===
ALTER TABLE public.caller_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caller_devices_select" ON public.caller_devices;
CREATE POLICY "caller_devices_select" ON public.caller_devices FOR SELECT
TO authenticated USING (public.is_admin() OR employee_id = auth.uid());

DROP POLICY IF EXISTS "caller_devices_insert" ON public.caller_devices;
CREATE POLICY "caller_devices_insert" ON public.caller_devices FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR employee_id = auth.uid());

DROP POLICY IF EXISTS "caller_devices_update" ON public.caller_devices;
CREATE POLICY "caller_devices_update" ON public.caller_devices FOR UPDATE
TO authenticated USING (public.is_admin() OR employee_id = auth.uid())
WITH CHECK (public.is_admin() OR employee_id = auth.uid());

DROP POLICY IF EXISTS "caller_devices_delete" ON public.caller_devices;
CREATE POLICY "caller_devices_delete" ON public.caller_devices FOR DELETE
TO authenticated USING (public.is_admin() OR employee_id = auth.uid());

-- === employee_product_cities ===
ALTER TABLE public.employee_product_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_product_cities_select" ON public.employee_product_cities;
CREATE POLICY "employee_product_cities_select" ON public.employee_product_cities FOR SELECT
TO authenticated USING (
  public.is_admin() OR employee_id = auth.uid()
  OR product_id IN (SELECT public.manager_product_ids())
);

DROP POLICY IF EXISTS "employee_product_cities_insert" ON public.employee_product_cities;
CREATE POLICY "employee_product_cities_insert" ON public.employee_product_cities FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "employee_product_cities_update" ON public.employee_product_cities;
CREATE POLICY "employee_product_cities_update" ON public.employee_product_cities FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "employee_product_cities_delete" ON public.employee_product_cities;
CREATE POLICY "employee_product_cities_delete" ON public.employee_product_cities FOR DELETE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id));

-- === manager_product_assignments ===
ALTER TABLE public.manager_product_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_product_assignments_select" ON public.manager_product_assignments;
CREATE POLICY "manager_product_assignments_select" ON public.manager_product_assignments FOR SELECT
TO authenticated USING (public.is_admin() OR manager_id = auth.uid());

DROP POLICY IF EXISTS "manager_product_assignments_insert" ON public.manager_product_assignments;
CREATE POLICY "manager_product_assignments_insert" ON public.manager_product_assignments FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "manager_product_assignments_update" ON public.manager_product_assignments;
CREATE POLICY "manager_product_assignments_update" ON public.manager_product_assignments FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "manager_product_assignments_delete" ON public.manager_product_assignments;
CREATE POLICY "manager_product_assignments_delete" ON public.manager_product_assignments FOR DELETE
TO authenticated USING (public.is_admin());

-- === leads ===
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR current_caller_id = auth.uid()
);

DROP POLICY IF EXISTS "leads_insert" ON public.leads;
CREATE POLICY "leads_insert" ON public.leads FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR public.is_employee_of_product(product_id)
);

DROP POLICY IF EXISTS "leads_update" ON public.leads;
CREATE POLICY "leads_update" ON public.leads FOR UPDATE
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR current_caller_id = auth.uid()
) WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR current_caller_id = auth.uid()
);

DROP POLICY IF EXISTS "leads_delete" ON public.leads;
CREATE POLICY "leads_delete" ON public.leads FOR DELETE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id));

-- === lead_status_history ===
ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_status_history_select" ON public.lead_status_history;
CREATE POLICY "lead_status_history_select" ON public.lead_status_history FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id)
  OR EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_status_history.lead_id AND l.current_caller_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "lead_status_history_insert" ON public.lead_status_history;
CREATE POLICY "lead_status_history_insert" ON public.lead_status_history FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id)
  OR employee_id = auth.uid() OR actor_id = auth.uid()
);

DROP POLICY IF EXISTS "lead_status_history_update" ON public.lead_status_history;
CREATE POLICY "lead_status_history_update" ON public.lead_status_history FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lead_status_history_delete" ON public.lead_status_history;
CREATE POLICY "lead_status_history_delete" ON public.lead_status_history FOR DELETE
TO authenticated USING (public.is_admin());

-- === lead_assignments ===
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_assignments_select" ON public.lead_assignments;
CREATE POLICY "lead_assignments_select" ON public.lead_assignments FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id)
  OR new_caller_id = auth.uid() OR previous_caller_id = auth.uid()
);

DROP POLICY IF EXISTS "lead_assignments_insert" ON public.lead_assignments;
CREATE POLICY "lead_assignments_insert" ON public.lead_assignments FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR actor_id = auth.uid()
);

DROP POLICY IF EXISTS "lead_assignments_update" ON public.lead_assignments;
CREATE POLICY "lead_assignments_update" ON public.lead_assignments FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lead_assignments_delete" ON public.lead_assignments;
CREATE POLICY "lead_assignments_delete" ON public.lead_assignments FOR DELETE
TO authenticated USING (public.is_admin());

-- === lead_platform_status ===
ALTER TABLE public.lead_platform_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_platform_status_select" ON public.lead_platform_status;
CREATE POLICY "lead_platform_status_select" ON public.lead_platform_status FOR SELECT
TO authenticated USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_platform_status.lead_id
    AND (l.current_caller_id = auth.uid() OR public.is_manager_of_product(l.product_id))
  )
);

DROP POLICY IF EXISTS "lead_platform_status_insert" ON public.lead_platform_status;
CREATE POLICY "lead_platform_status_insert" ON public.lead_platform_status FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin() OR completed_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_platform_status.lead_id AND public.is_manager_of_product(l.product_id)
  )
);

DROP POLICY IF EXISTS "lead_platform_status_update" ON public.lead_platform_status;
CREATE POLICY "lead_platform_status_update" ON public.lead_platform_status FOR UPDATE
TO authenticated USING (public.is_admin() OR completed_by = auth.uid())
WITH CHECK (public.is_admin() OR completed_by = auth.uid());

DROP POLICY IF EXISTS "lead_platform_status_delete" ON public.lead_platform_status;
CREATE POLICY "lead_platform_status_delete" ON public.lead_platform_status FOR DELETE
TO authenticated USING (public.is_admin());

-- === scheduled_transitions ===
ALTER TABLE public.scheduled_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_transitions_select" ON public.scheduled_transitions;
CREATE POLICY "scheduled_transitions_select" ON public.scheduled_transitions FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR current_caller_id = auth.uid()
);

DROP POLICY IF EXISTS "scheduled_transitions_insert" ON public.scheduled_transitions;
CREATE POLICY "scheduled_transitions_insert" ON public.scheduled_transitions FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "scheduled_transitions_update" ON public.scheduled_transitions;
CREATE POLICY "scheduled_transitions_update" ON public.scheduled_transitions FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "scheduled_transitions_delete" ON public.scheduled_transitions;
CREATE POLICY "scheduled_transitions_delete" ON public.scheduled_transitions FOR DELETE
TO authenticated USING (public.is_admin());

-- === call_history ===
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_history_select" ON public.call_history;
CREATE POLICY "call_history_select" ON public.call_history FOR SELECT
TO authenticated USING (
  public.is_admin() OR caller_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = call_history.lead_id
    AND (l.current_caller_id = auth.uid() OR public.is_manager_of_product(l.product_id))
  )
);

DROP POLICY IF EXISTS "call_history_insert" ON public.call_history;
CREATE POLICY "call_history_insert" ON public.call_history FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin() OR caller_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = call_history.lead_id AND public.is_manager_of_product(l.product_id)
  )
);

DROP POLICY IF EXISTS "call_history_update" ON public.call_history;
CREATE POLICY "call_history_update" ON public.call_history FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "call_history_delete" ON public.call_history;
CREATE POLICY "call_history_delete" ON public.call_history FOR DELETE
TO authenticated USING (public.is_admin());

-- === issues ===
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "issues_select" ON public.issues;
CREATE POLICY "issues_select" ON public.issues FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "issues_insert" ON public.issues;
CREATE POLICY "issues_insert" ON public.issues FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "issues_update" ON public.issues;
CREATE POLICY "issues_update" ON public.issues FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "issues_delete" ON public.issues;
CREATE POLICY "issues_delete" ON public.issues FOR DELETE
TO authenticated USING (public.is_admin());

-- === other_hero_leads ===
ALTER TABLE public.other_hero_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "other_hero_leads_select" ON public.other_hero_leads;
CREATE POLICY "other_hero_leads_select" ON public.other_hero_leads FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "other_hero_leads_insert" ON public.other_hero_leads;
CREATE POLICY "other_hero_leads_insert" ON public.other_hero_leads FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "other_hero_leads_update" ON public.other_hero_leads;
CREATE POLICY "other_hero_leads_update" ON public.other_hero_leads FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "other_hero_leads_delete" ON public.other_hero_leads;
CREATE POLICY "other_hero_leads_delete" ON public.other_hero_leads FOR DELETE
TO authenticated USING (public.is_admin());

-- === payment_records ===
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_records_select" ON public.payment_records;
CREATE POLICY "payment_records_select" ON public.payment_records FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "payment_records_insert" ON public.payment_records;
CREATE POLICY "payment_records_insert" ON public.payment_records FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "payment_records_update" ON public.payment_records;
CREATE POLICY "payment_records_update" ON public.payment_records FOR UPDATE
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
) WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "payment_records_delete" ON public.payment_records;
CREATE POLICY "payment_records_delete" ON public.payment_records FOR DELETE
TO authenticated USING (public.is_admin());

-- === car_qr_codes ===
ALTER TABLE public.car_qr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "car_qr_codes_select" ON public.car_qr_codes;
CREATE POLICY "car_qr_codes_select" ON public.car_qr_codes FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR public.is_employee_of_product(product_id)
);

DROP POLICY IF EXISTS "car_qr_codes_insert" ON public.car_qr_codes;
CREATE POLICY "car_qr_codes_insert" ON public.car_qr_codes FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "car_qr_codes_update" ON public.car_qr_codes;
CREATE POLICY "car_qr_codes_update" ON public.car_qr_codes FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "car_qr_codes_delete" ON public.car_qr_codes;
CREATE POLICY "car_qr_codes_delete" ON public.car_qr_codes FOR DELETE
TO authenticated USING (public.is_admin());

-- === directory_entries ===
ALTER TABLE public.directory_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_entries_select" ON public.directory_entries;
CREATE POLICY "directory_entries_select" ON public.directory_entries FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR public.is_employee_of_product(product_id)
);

DROP POLICY IF EXISTS "directory_entries_insert" ON public.directory_entries;
CREATE POLICY "directory_entries_insert" ON public.directory_entries FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "directory_entries_update" ON public.directory_entries;
CREATE POLICY "directory_entries_update" ON public.directory_entries FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "directory_entries_delete" ON public.directory_entries;
CREATE POLICY "directory_entries_delete" ON public.directory_entries FOR DELETE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id));

-- === directory_labels ===
ALTER TABLE public.directory_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_labels_select" ON public.directory_labels;
CREATE POLICY "directory_labels_select" ON public.directory_labels FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "directory_labels_insert" ON public.directory_labels;
CREATE POLICY "directory_labels_insert" ON public.directory_labels FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "directory_labels_update" ON public.directory_labels;
CREATE POLICY "directory_labels_update" ON public.directory_labels FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "directory_labels_delete" ON public.directory_labels;
CREATE POLICY "directory_labels_delete" ON public.directory_labels FOR DELETE
TO authenticated USING (public.is_admin());

-- === employee_targets ===
ALTER TABLE public.employee_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_targets_select" ON public.employee_targets;
CREATE POLICY "employee_targets_select" ON public.employee_targets FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "employee_targets_insert" ON public.employee_targets;
CREATE POLICY "employee_targets_insert" ON public.employee_targets FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "employee_targets_update" ON public.employee_targets;
CREATE POLICY "employee_targets_update" ON public.employee_targets FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "employee_targets_delete" ON public.employee_targets;
CREATE POLICY "employee_targets_delete" ON public.employee_targets FOR DELETE
TO authenticated USING (public.is_admin());

-- === target_metrics ===
ALTER TABLE public.target_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "target_metrics_select" ON public.target_metrics;
CREATE POLICY "target_metrics_select" ON public.target_metrics FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR public.is_employee_of_product(product_id)
);

DROP POLICY IF EXISTS "target_metrics_insert" ON public.target_metrics;
CREATE POLICY "target_metrics_insert" ON public.target_metrics FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "target_metrics_update" ON public.target_metrics;
CREATE POLICY "target_metrics_update" ON public.target_metrics FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "target_metrics_delete" ON public.target_metrics;
CREATE POLICY "target_metrics_delete" ON public.target_metrics FOR DELETE
TO authenticated USING (public.is_admin());

-- === import_batches ===
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_batches_select" ON public.import_batches;
CREATE POLICY "import_batches_select" ON public.import_batches FOR SELECT
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "import_batches_insert" ON public.import_batches;
CREATE POLICY "import_batches_insert" ON public.import_batches FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "import_batches_update" ON public.import_batches;
CREATE POLICY "import_batches_update" ON public.import_batches FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "import_batches_delete" ON public.import_batches;
CREATE POLICY "import_batches_delete" ON public.import_batches FOR DELETE
TO authenticated USING (public.is_admin());

-- === import_records ===
ALTER TABLE public.import_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_records_select" ON public.import_records;
CREATE POLICY "import_records_select" ON public.import_records FOR SELECT
TO authenticated USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.import_batches ib
    WHERE ib.id = import_records.batch_id AND public.is_manager_of_product(ib.product_id)
  )
);

DROP POLICY IF EXISTS "import_records_insert" ON public.import_records;
CREATE POLICY "import_records_insert" ON public.import_records FOR INSERT
TO authenticated WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.import_batches ib
    WHERE ib.id = import_records.batch_id AND public.is_manager_of_product(ib.product_id)
  )
);

DROP POLICY IF EXISTS "import_records_update" ON public.import_records;
CREATE POLICY "import_records_update" ON public.import_records FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "import_records_delete" ON public.import_records;
CREATE POLICY "import_records_delete" ON public.import_records FOR DELETE
TO authenticated USING (public.is_admin());

-- === audit_logs ===
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT
TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "audit_logs_update" ON public.audit_logs;
CREATE POLICY "audit_logs_update" ON public.audit_logs FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "audit_logs_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_delete" ON public.audit_logs FOR DELETE
TO authenticated USING (public.is_admin());

-- === whatsapp_accounts ===
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_accounts_select" ON public.whatsapp_accounts;
CREATE POLICY "whatsapp_accounts_select" ON public.whatsapp_accounts FOR SELECT
TO authenticated USING (public.is_admin() OR employee_id = auth.uid());

DROP POLICY IF EXISTS "whatsapp_accounts_insert" ON public.whatsapp_accounts;
CREATE POLICY "whatsapp_accounts_insert" ON public.whatsapp_accounts FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR employee_id = auth.uid());

DROP POLICY IF EXISTS "whatsapp_accounts_update" ON public.whatsapp_accounts;
CREATE POLICY "whatsapp_accounts_update" ON public.whatsapp_accounts FOR UPDATE
TO authenticated USING (public.is_admin() OR employee_id = auth.uid())
WITH CHECK (public.is_admin() OR employee_id = auth.uid());

DROP POLICY IF EXISTS "whatsapp_accounts_delete" ON public.whatsapp_accounts;
CREATE POLICY "whatsapp_accounts_delete" ON public.whatsapp_accounts FOR DELETE
TO authenticated USING (public.is_admin());

-- === sims ===
ALTER TABLE public.sims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sims_select" ON public.sims;
CREATE POLICY "sims_select" ON public.sims FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "sims_insert" ON public.sims;
CREATE POLICY "sims_insert" ON public.sims FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "sims_update" ON public.sims;
CREATE POLICY "sims_update" ON public.sims FOR UPDATE
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
) WITH CHECK (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "sims_delete" ON public.sims;
CREATE POLICY "sims_delete" ON public.sims FOR DELETE
TO authenticated USING (public.is_admin());

-- === hero_ids ===
ALTER TABLE public.hero_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hero_ids_select" ON public.hero_ids;
CREATE POLICY "hero_ids_select" ON public.hero_ids FOR SELECT
TO authenticated USING (
  public.is_admin() OR public.is_manager_of_product(product_id) OR employee_id = auth.uid()
);

DROP POLICY IF EXISTS "hero_ids_insert" ON public.hero_ids;
CREATE POLICY "hero_ids_insert" ON public.hero_ids FOR INSERT
TO authenticated WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "hero_ids_update" ON public.hero_ids;
CREATE POLICY "hero_ids_update" ON public.hero_ids FOR UPDATE
TO authenticated USING (public.is_admin() OR public.is_manager_of_product(product_id))
WITH CHECK (public.is_admin() OR public.is_manager_of_product(product_id));

DROP POLICY IF EXISTS "hero_ids_delete" ON public.hero_ids;
CREATE POLICY "hero_ids_delete" ON public.hero_ids FOR DELETE
TO authenticated USING (public.is_admin());
