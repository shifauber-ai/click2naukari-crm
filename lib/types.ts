export type Role = "ADMIN" | "EMPLOYEE";

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
  | "ADMIN_REVIEW";

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
