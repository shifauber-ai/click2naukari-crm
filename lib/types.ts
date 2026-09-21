export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";

export type HCLeadStatus = "TAG_ADDED" | "RINGING";
export const HC_LEAD_STATUSES: HCLeadStatus[] = ["TAG_ADDED", "RINGING"];
export const HC_STATUS_LABELS: Record<HCLeadStatus, string> = {
  TAG_ADDED: "Tag Added",
  RINGING: "Ringing",
};

export type LeadStatus =
  | "NEW"
  | "RINGING"
  | "INTERESTED"
  | "CALLBACK"
  | "ID_DONE"
  | "ID_BLOCK"
  | "DOC_ISSUE"
  | "VEHICLE_ISSUE"
  | "OTHER_ISSUE"
  | "OTHER_HERO"
  | "ADMIN_REVIEW"
  | "TAG_ADDED"
  | "NOT_INTERESTED"
  | "EXISTING"
  | "FRESH"
  | "OTHER_NUMBER"
  | "PAYMENT_ISSUE"
  | "DONE";

export const LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "RINGING",
  "INTERESTED",
  "CALLBACK",
  "ID_DONE",
  "ID_BLOCK",
  "DOC_ISSUE",
  "VEHICLE_ISSUE",
  "OTHER_ISSUE",
  "OTHER_HERO",
  "ADMIN_REVIEW",
  "TAG_ADDED",
  "NOT_INTERESTED",
  "EXISTING",
  "FRESH",
  "OTHER_NUMBER",
  "PAYMENT_ISSUE",
  "DONE",
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  RINGING: "Ringing",
  INTERESTED: "Interested",
  CALLBACK: "Call Back",
  ID_DONE: "ID Done",
  ID_BLOCK: "ID Block",
  DOC_ISSUE: "Doc Issue",
  VEHICLE_ISSUE: "Vehicle Issue",
  OTHER_ISSUE: "Other Issue",
  OTHER_HERO: "Other Hero",
  ADMIN_REVIEW: "Admin Review",
  TAG_ADDED: "Tag Added",
  NOT_INTERESTED: "Not Interested",
  EXISTING: "Existing",
  FRESH: "Fresh",
  OTHER_NUMBER: "Other Number",
  PAYMENT_ISSUE: "Payment Issue",
  DONE: "Done",
};

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CallerQueue {
  id: string;
  product_id: string;
  employee_id: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product?: Product;
  employee?: Profile;
  city_id?: string | null;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  product_id: string;
  current_caller_id: string | null;
  status: LeadStatus;
  remarks: string;
  rotation_count: number;
  is_active: boolean;
  in_admin_review: boolean;
  assigned_at: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  platform?: string | null;
  city?: string | null;
  source?: string | null;
  vehicle_no?: string | null;
  dl_no?: string | null;
  total_trips?: number | null;
  license_no?: string | null;
  ringing_started_at?: string | null;
  uber_id_done?: boolean;
  ola_id_done?: boolean;
  rapido_id_done?: boolean;
  product?: Product;
  current_caller?: Profile | null;
}

export interface LeadAssignment {
  id: string;
  lead_id: string;
  product_id: string;
  previous_caller_id: string | null;
  new_caller_id: string | null;
  previous_status: string | null;
  new_status: string;
  assignment_reason: string;
  actor_type: string;
  actor_id: string | null;
  attempt_number: number;
  remarks: string;
  created_at: string;
  new_caller?: Profile | null;
  previous_caller?: Profile | null;
}

export interface LeadStatusHistory {
  id: string;
  lead_id: string;
  product_id: string;
  employee_id: string | null;
  previous_status: string | null;
  new_status: string;
  remarks: string;
  actor_type: string;
  actor_id: string | null;
  created_at: string;
}

export interface ScheduledTransition {
  id: string;
  lead_id: string;
  product_id: string;
  current_caller_id: string | null;
  expected_status: string;
  next_action_at: string;
  transition_type: string;
  status: string;
  attempt_number: number;
  error_info: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface Issue {
  id: string;
  lead_id: string;
  product_id: string;
  employee_id: string | null;
  issue_type: string;
  issue_status: string;
  remarks: string;
  created_at: string;
  updated_at: string;
  lead?: Lead;
  product?: Product;
  employee?: Profile | null;
}

export interface OtherHeroLead {
  id: string;
  lead_id: string;
  product_id: string;
  employee_id: string | null;
  remarks: string;
  created_at: string;
  updated_at: string;
  lead?: Lead;
  product?: Product;
  employee?: Profile | null;
}

export interface HeroId {
  id: string;
  hero_code: string;
  product_id: string | null;
  employee_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  product?: Product | null;
  employee?: Profile | null;
}

export interface Sim {
  id: string;
  sim_code: string;
  mobile_number: string;
  employee_id: string | null;
  product_id: string | null;
  status: string;
  assigned_date: string | null;
  released_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  employee?: Profile | null;
  product?: Product | null;
}

export interface WhatsAppAccount {
  id: string;
  employee_id: string;
  whatsapp_number: string;
  connection_status: string;
  integration_status: string;
  last_connected: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  employee?: Profile;
}

export interface ImportBatch {
  id: string;
  filename: string;
  total_rows: number;
  imported: number;
  duplicate: number;
  failed: number;
  invalid: number;
  missing_fields: number;
  status: string;
  created_by: string | null;
  created_at: string;
  product_id?: string | null;
  platform?: string | null;
  uploaded_by?: string | null;
  existing_lead_duplicates?: number;
  internal_duplicates?: number;
  skipped?: number;
}

export type DuplicateType = "NONE" | "INTERNAL_DUPLICATE" | "EXISTING_LEAD_DUPLICATE";

export interface ImportRecord {
  id: string;
  batch_id: string;
  row_number: number;
  name: string;
  phone: string;
  product_id: string | null;
  platform: string | null;
  city: string | null;
  label: string | null;
  status: string;
  duplicate_type: DuplicateType;
  existing_lead_id: string | null;
  validation_error: string | null;
  imported_at: string;
  existing_lead?: Lead | null;
}

export interface CallHistory {
  id: string;
  lead_id: string | null;
  product_id: string | null;
  caller_id: string | null;
  phone_number: string;
  direction: string;
  call_status: string;
  duration_seconds: number;
  outcome: string | null;
  remarks: string | null;
  is_simulated: boolean;
  call_timestamp: string;
  created_at: string;
  sync_source: string | null;
  device_id: string | null;
  external_call_id: string | null;
  normalized_phone: string | null;
  synced_at: string | null;
  lead?: Lead | null;
  product?: Product | null;
  caller?: Profile | null;
}

export interface CallerDevice {
  id: string;
  employee_id: string;
  device_name: string;
  device_identifier: string;
  phone_number: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectoryLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface DirectoryEntry {
  id: string;
  lead_id: string | null;
  product_id: string | null;
  platform: string | null;
  city: string | null;
  status: string;
  label_id: string | null;
  candidate_name: string;
  phone_number: string;
  employee_id: string | null;
  remarks: string;
  saved_at: string;
  created_at: string;
  updated_at: string;
  import_batch_id?: string | null;
  duplicate_type?: DuplicateType;
  existing_lead_id?: string | null;
  product?: Product | null;
  label?: DirectoryLabel | null;
  employee?: Profile | null;
}

export interface PaymentMerchant {
  id: string;
  name: string;
  provider: string;
  razorpay_key_id: string;
  webhook_secret_configured: boolean;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  employee_id: string | null;
  product_id: string | null;
  lead_id: string | null;
  candidate_name: string;
  amount: number;
  payment_status: string;
  payment_method: string;
  transaction_id: string;
  remarks: string;
  service_description?: string;
  payment_mode?: string;
  qr_id?: string | null;
  collected_by?: string | null;
  payment_date: string;
  payment_time: string;
  created_at: string;
  updated_at: string;
  employee?: Profile | null;
  product?: Product | null;
  lead?: Lead | null;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Profile | null;
}

export interface ProductCity {
  id: string;
  product_id: string;
  city_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Platform {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ManagerProductAssignment {
  id: string;
  manager_id: string;
  product_id: string;
  created_at: string;
  product?: Product | null;
}

export type TargetPeriodType = "DAILY" | "WEEKLY";
export type TargetValueType = "COUNT" | "AMOUNT";

export interface TargetMetric {
  id: string;
  product_id: string;
  name: string;
  key: string;
  value_type: TargetValueType;
  display_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeTarget {
  id: string;
  employee_id: string;
  product_id: string;
  city_id: string | null;
  target_type: string;
  target_metric_id: string | null;
  target_value: number;
  period_type: TargetPeriodType;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: Profile | null;
  product?: Product | null;
  metric?: TargetMetric | null;
}
