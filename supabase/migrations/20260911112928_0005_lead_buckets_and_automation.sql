-- ============================================================================
-- 0005_lead_buckets_and_automation.sql
-- ============================================================================

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  scheduled_for timestamptz not null,
  note text,
  created_by uuid references profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_follow_ups_lead on follow_ups(lead_id, created_at desc);
create index idx_follow_ups_scheduled on follow_ups(scheduled_for) where completed_at is null;

create table issues (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  status_id uuid references statuses(id),
  note text,
  created_by uuid references profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index idx_issues_lead on issues(lead_id, created_at desc);
create index idx_issues_open on issues(created_at) where resolved_at is null;

create table other_hero (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_other_hero_lead on other_hero(lead_id, created_at desc);

create or replace function update_lead_status(
  p_lead_id uuid,
  p_new_status_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_product_id uuid;
  v_assigned_employee_id uuid;
  v_assigned_caller_id uuid;
  v_old_status_id uuid;
  v_bucket text;
  v_is_ringing boolean;
begin
  select product_id, assigned_employee_id, assigned_caller_id, status_id
    into v_product_id, v_assigned_employee_id, v_assigned_caller_id, v_old_status_id
  from leads where id = p_lead_id for update;

  if v_product_id is null then
    raise exception 'lead % not found', p_lead_id;
  end if;

  if v_actor is not null then
    if not (
      has_product_access(v_product_id)
      or v_assigned_employee_id = v_actor
      or v_assigned_caller_id = v_actor
    ) then
      raise exception 'not authorized to change status of lead %', p_lead_id;
    end if;
  end if;

  select bucket, is_ringing into v_bucket, v_is_ringing from statuses where id = p_new_status_id;

  update leads
  set status_id = p_new_status_id,
      needs_admin_review = case when not v_is_ringing then false else needs_admin_review end
  where id = p_lead_id;

  insert into lead_status_history (lead_id, old_status_id, new_status_id, changed_by, note)
  values (p_lead_id, v_old_status_id, p_new_status_id, v_actor, p_note);

  if v_bucket = 'follow_up' then
    insert into follow_ups (lead_id, scheduled_for, note, created_by)
    values (p_lead_id, now() + interval '1 day', p_note, v_actor);
  elsif v_bucket = 'issues' then
    insert into issues (lead_id, status_id, note, created_by)
    values (p_lead_id, p_new_status_id, p_note, v_actor);
  elsif v_bucket = 'other_hero' then
    insert into other_hero (lead_id, note, created_by)
    values (p_lead_id, p_note, v_actor);
  end if;
end;
$$;

revoke execute on function update_lead_status(uuid, uuid, text) from public, anon;
grant execute on function update_lead_status(uuid, uuid, text) to authenticated, service_role;

create or replace function sync_lead_assigned_employee()
returns trigger
language plpgsql
as $$
begin
  if new.is_current then
    update leads set assigned_employee_id = new.employee_id where id = new.lead_id;
  end if;
  return new;
end;
$$;
create trigger trg_lead_assignments_sync after insert or update on lead_assignments
  for each row execute function sync_lead_assigned_employee();

create or replace function reassign_lead(
  p_lead_id uuid,
  p_employee_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_product_id uuid;
begin
  select product_id into v_product_id from leads where id = p_lead_id;
  if v_product_id is null then
    raise exception 'lead % not found', p_lead_id;
  end if;

  if v_actor is not null and not (is_admin() or (is_manager() and has_product_access(v_product_id))) then
    raise exception 'not authorized to reassign lead %', p_lead_id;
  end if;

  update lead_assignments
  set is_current = false, unassigned_at = now()
  where lead_id = p_lead_id and is_current;

  insert into lead_assignments (lead_id, employee_id, assigned_by, reason, is_current)
  values (p_lead_id, p_employee_id, v_actor, p_reason, true);
end;
$$;

revoke execute on function reassign_lead(uuid, uuid, text) from public, anon;
grant execute on function reassign_lead(uuid, uuid, text) to authenticated, service_role;