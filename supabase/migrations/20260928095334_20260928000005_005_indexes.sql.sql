/*
# 005 — Performance Indexes

## Purpose
Creates all indexes needed for the frontend's common query patterns.

## Indexes

### leads
- idx_leads_product_id — filter by product
- idx_leads_current_caller_id — filter by assigned caller
- idx_leads_status — filter by status
- idx_leads_phone — duplicate check by phone
- idx_leads_city — filter by city
- idx_leads_created_at — date range filters
- idx_leads_next_followup_at — follow-up queries
- idx_leads_is_active — active/inactive filter

### lead_platform_status
- idx_lead_platform_status_lead_id — filter by lead
- idx_lead_platform_status_platform — filter by platform
- (unique lead_id + platform already created in 003)

### lead_status_history
- idx_lead_status_history_lead_id — filter by lead
- idx_lead_status_history_created_at — chronological ordering

### lead_assignments
- idx_lead_assignments_lead_id — filter by lead
- idx_lead_assignments_new_caller_id — filter by caller

### call_history
- idx_call_history_caller_id — filter by caller
- idx_call_history_lead_id — filter by lead
- idx_call_history_call_timestamp — date range filters
- idx_call_history_phone_number — lookup by phone
- idx_call_history_external_call_id — idempotency check

### payment_records
- idx_payment_records_lead_id — filter by lead
- idx_payment_records_employee_id — filter by employee
- idx_payment_records_payment_date — date range filters
- idx_payment_records_product_id — filter by product

### caller_queues
- idx_caller_queues_product_id — filter by product
- idx_caller_queues_employee_id — filter by employee
- idx_caller_queues_city_id — filter by city

### Other indexes
- import_batches.product_id
- import_records.batch_id
- employee_targets.employee_id
- employee_targets.product_id
- directory_entries.product_id
- issues.lead_id
- other_hero_leads.lead_id
*/

CREATE INDEX IF NOT EXISTS idx_leads_product_id ON public.leads(product_id);
CREATE INDEX IF NOT EXISTS idx_leads_current_caller_id ON public.leads(current_caller_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_city ON public.leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_next_followup_at ON public.leads(next_followup_at);
CREATE INDEX IF NOT EXISTS idx_leads_is_active ON public.leads(is_active);

CREATE INDEX IF NOT EXISTS idx_lead_platform_status_lead_id ON public.lead_platform_status(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_platform_status_platform ON public.lead_platform_status(platform);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_id ON public.lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_created_at ON public.lead_status_history(created_at);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id ON public.lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_new_caller_id ON public.lead_assignments(new_caller_id);

CREATE INDEX IF NOT EXISTS idx_call_history_caller_id ON public.call_history(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_history_lead_id ON public.call_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_history_call_timestamp ON public.call_history(call_timestamp);
CREATE INDEX IF NOT EXISTS idx_call_history_phone_number ON public.call_history(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_history_external_call_id ON public.call_history(external_call_id);

CREATE INDEX IF NOT EXISTS idx_payment_records_lead_id ON public.payment_records(lead_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_employee_id ON public.payment_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_payment_date ON public.payment_records(payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_records_product_id ON public.payment_records(product_id);

CREATE INDEX IF NOT EXISTS idx_caller_queues_product_id ON public.caller_queues(product_id);
CREATE INDEX IF NOT EXISTS idx_caller_queues_employee_id ON public.caller_queues(employee_id);
CREATE INDEX IF NOT EXISTS idx_caller_queues_city_id ON public.caller_queues(city_id);

CREATE INDEX IF NOT EXISTS idx_import_batches_product_id ON public.import_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_import_records_batch_id ON public.import_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_employee_targets_employee_id ON public.employee_targets(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_targets_product_id ON public.employee_targets(product_id);
CREATE INDEX IF NOT EXISTS idx_directory_entries_product_id ON public.directory_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_issues_lead_id ON public.issues(lead_id);
CREATE INDEX IF NOT EXISTS idx_other_hero_leads_lead_id ON public.other_hero_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transitions_lead_id ON public.scheduled_transitions(lead_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transitions_status ON public.scheduled_transitions(status);
