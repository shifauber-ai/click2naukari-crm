-- ============================================================================
-- 0007_round_robin_and_rotation.sql
-- ============================================================================

create or replace function assign_lead_round_robin(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_platform_id uuid;
  v_queue_id uuid;
  v_last_member_id uuid;
  v_next_member record;
  v_ringing_status_id uuid;
begin
  select product_id, platform_id into v_product_id, v_platform_id
  from leads where id = p_lead_id;

  select id, last_assigned_member_id into v_queue_id, v_last_member_id
  from caller_queue where product_id = v_product_id and is_active;

  if v_queue_id is null then
    return;
  end if;

  select cqm.* into v_next_member
  from caller_queue_members cqm
  where cqm.queue_id = v_queue_id and cqm.is_active
    and cqm.position > coalesce(
      (select position from caller_queue_members where id = v_last_member_id), -1
    )
  order by cqm.position asc
  limit 1;

  if v_next_member is null then
    select cqm.* into v_next_member
    from caller_queue_members cqm
    where cqm.queue_id = v_queue_id and cqm.is_active
    order by cqm.position asc
    limit 1;
  end if;

  if v_next_member is null then
    return;
  end if;

  update caller_queue set last_assigned_member_id = v_next_member.id where id = v_queue_id;

  update leads set assigned_caller_id = v_next_member.employee_id where id = p_lead_id;
  perform reassign_lead(p_lead_id, v_next_member.employee_id, 'Round-robin auto-assignment');

  select ps.status_id into v_ringing_status_id
  from platform_statuses ps
  join statuses s on s.id = ps.status_id
  where ps.product_id = v_product_id and ps.platform_id = v_platform_id
    and s.is_ringing and ps.is_active
  limit 1;

  if v_ringing_status_id is not null then
    perform update_lead_status(p_lead_id, v_ringing_status_id, 'Entered caller rotation');
  end if;

  insert into caller_assignment_history
    (lead_id, product_id, caller_id, employee_id, status, cycle_number, attempt_number)
  values
    (p_lead_id, v_product_id, v_next_member.employee_id, v_next_member.employee_id, 'ringing', 1, 1);
end;
$$;

create or replace function trigger_assign_new_lead()
returns trigger
language plpgsql
as $$
declare
  v_has_queue boolean;
begin
  select has_caller_queue into v_has_queue from products where id = new.product_id;
  if coalesce(v_has_queue, false) then
    perform assign_lead_round_robin(new.id);
  end if;
  return new;
end;
$$;
create trigger trg_leads_auto_assign after insert on leads
  for each row execute function trigger_assign_new_lead();

create or replace function process_ringing_rotations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due record;
  v_queue_id uuid;
  v_current_position int;
  v_next_member record;
  v_attempted_count int;
  v_active_count int;
begin
  for v_due in
    select cah.id as attempt_id, cah.lead_id, cah.product_id, cah.caller_id,
           cah.cycle_number, cah.attempt_number, cah.assigned_at,
           l.platform_id, cq.rotation_seconds, cq.id as queue_id
    from caller_assignment_history cah
    join leads l on l.id = cah.lead_id
    join statuses s on s.id = l.status_id
    join caller_queue cq on cq.product_id = cah.product_id
    where not cah.completed
      and s.is_ringing
      and not l.needs_admin_review
      and cah.assigned_at <= now() - make_interval(secs => cq.rotation_seconds)
      and cah.id = (
        select id from caller_assignment_history
        where lead_id = cah.lead_id
        order by cycle_number desc, attempt_number desc
        limit 1
      )
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_due.lead_id::text, 0));

    update caller_assignment_history
    set completed = true, call_completed_at = now(), status = 'rotated',
        reason = 'No response within rotation window'
    where id = v_due.attempt_id;

    v_queue_id := v_due.queue_id;

    select count(*) into v_active_count
    from caller_queue_members where queue_id = v_queue_id and is_active;

    select count(distinct caller_id) into v_attempted_count
    from caller_assignment_history
    where lead_id = v_due.lead_id and cycle_number = v_due.cycle_number;

    if v_attempted_count >= v_active_count then
      update leads set needs_admin_review = true where id = v_due.lead_id;

      update caller_assignment_history
      set status = 'admin_review'
      where id = v_due.attempt_id;

      continue;
    end if;

    select cqm.position into v_current_position
    from caller_queue_members cqm
    where cqm.queue_id = v_queue_id and cqm.employee_id = v_due.caller_id;

    select cqm.* into v_next_member
    from caller_queue_members cqm
    where cqm.queue_id = v_queue_id and cqm.is_active
      and cqm.position > coalesce(v_current_position, -1)
      and cqm.employee_id not in (
        select caller_id from caller_assignment_history
        where lead_id = v_due.lead_id and cycle_number = v_due.cycle_number
      )
    order by cqm.position asc
    limit 1;

    if v_next_member is null then
      select cqm.* into v_next_member
      from caller_queue_members cqm
      where cqm.queue_id = v_queue_id and cqm.is_active
        and cqm.employee_id not in (
          select caller_id from caller_assignment_history
          where lead_id = v_due.lead_id and cycle_number = v_due.cycle_number
        )
      order by cqm.position asc
      limit 1;
    end if;

    if v_next_member is null then
      update leads set needs_admin_review = true where id = v_due.lead_id;
      continue;
    end if;

    update caller_queue set last_assigned_member_id = v_next_member.id where id = v_queue_id;
    update leads set assigned_caller_id = v_next_member.employee_id where id = v_due.lead_id;
    perform reassign_lead(v_due.lead_id, v_next_member.employee_id, 'Rotated: previous caller did not respond in time');

    insert into caller_assignment_history
      (lead_id, product_id, caller_id, employee_id, status, cycle_number, attempt_number)
    values
      (v_due.lead_id, v_due.product_id, v_next_member.employee_id, v_next_member.employee_id,
       'ringing', v_due.cycle_number, v_due.attempt_number + 1);
  end loop;
end;
$$;

comment on function process_ringing_rotations() is
  'Scheduled every minute by pg_cron. Never call from the frontend.';

select cron.schedule(
  'ringing_rotation_tick',
  '* * * * *',
  $$select process_ringing_rotations();$$
) where not exists (select 1 from cron.job where jobname = 'ringing_rotation_tick');

revoke execute on function assign_lead_round_robin(uuid) from public, anon, authenticated;
revoke execute on function process_ringing_rotations() from public, anon, authenticated;