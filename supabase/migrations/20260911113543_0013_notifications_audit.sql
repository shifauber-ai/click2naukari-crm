-- ============================================================================
-- 0013_notifications_audit.sql
-- notifications (in-app, per-profile) and audit_logs (spec section 48).
-- audit_logs is deliberately written to by explicit application calls
-- (log_audit(), an RPC) rather than blanket table triggers: several
-- required events — login, logout, export — aren't row mutations at all,
-- so a trigger-only approach could never cover them, and a mixed
-- "triggers for some tables, calls for others" scheme is worse than one
-- consistent rule. Lead-specific history (status/assignment changes) is
-- already fully preserved in lead_status_history / lead_assignments /
-- caller_assignment_history — those ARE the detailed audit trail for
-- leads; audit_logs captures the broader action log across the whole app.
-- ============================================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null,          -- 'admin_review' | 'import_completed' | 'lead_assigned' | ...
  title text not null,
  body text,
  data jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_profile on notifications(profile_id, is_read, created_at desc);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),   -- null = system (rotation engine, retention cleanup)
  action text not null,                   -- 'login' | 'logout' | 'user.create' | 'lead.reassign' | 'import.run' | 'export.run' | 'payment.create' | 'device.create' | ...
  entity text not null,                   -- 'profile' | 'lead' | 'hc_lead' | 'payment' | 'import_batch' | 'call_sync_device' | 'directory' | ...
  entity_id text,
  metadata jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_user on audit_logs(user_id, created_at desc);
create index idx_audit_logs_entity on audit_logs(entity, entity_id);
create index idx_audit_logs_action on audit_logs(action, created_at desc);
create index idx_audit_logs_created_at on audit_logs(created_at desc);

create or replace function log_audit(
  p_action text, p_entity text, p_entity_id text default null,
  p_metadata jsonb default null, p_ip_address text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into audit_logs (user_id, action, entity, entity_id, metadata, ip_address)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_metadata, p_ip_address)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function log_audit(text, text, text, jsonb, text) is
  'Called via supabase.rpc("log_audit", ...) from server actions/route handlers after every action in spec section 48''s list. auth.uid() is read server-side from the request''s own session, never trusted from the client payload.';

revoke execute on function log_audit(text, text, text, jsonb, text) from public, anon;
grant execute on function log_audit(text, text, text, jsonb, text) to authenticated, service_role;
