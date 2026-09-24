-- ============================================================================
-- 0017_admin_review.sql
-- Manual Admin Review actions (spec section 13).
-- ============================================================================

create or replace function admin_reassign_caller(p_lead_id uuid, p_caller_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_product_id uuid;
  v_platform_id uuid;
  v_next_cycle int;
  v_ringing_status_id uuid;
begin
  select product_id, platform_id into v_product_id, v_platform_id from leads where id = p_lead_id for update;
  if v_product_id is null then
    raise exception 'lead % not found', p_lead_id;
  end if;

  if v_actor is not null and not (is_admin() or (is_manager() and has_product_access(v_product_id))) then
    raise exception 'not authorized to reassign caller for lead %', p_lead_id;
  end if;

  if not exists (
    select 1 from caller_queue_members cqm
    join caller_queue cq on cq.id = cqm.queue_id
    where cq.product_id = v_product_id and cqm.employee_id = p_caller_id
  ) then
    raise exception 'caller % is not in this product''s queue', p_caller_id;
  end if;

  update caller_assignment_history
  set completed = true, call_completed_at = now(), status = 'resolved',
      reason = coalesce(p_note, 'Reassigned via Admin Review')
  where lead_id = p_lead_id and not completed;

  select coalesce(max(cycle_number), 0) + 1 into v_next_cycle
  from caller_assignment_history where lead_id = p_lead_id;

  update leads
  set assigned_caller_id = p_caller_id, needs_admin_review = false
  where id = p_lead_id;

  perform reassign_lead(p_lead_id, p_caller_id, coalesce(p_note, 'Reassigned via Admin Review'));

  select ps.status_id into v_ringing_status_id
  from platform_statuses ps
  join statuses s on s.id = ps.status_id
  where ps.product_id = v_product_id and ps.platform_id = v_platform_id
    and s.is_ringing and ps.is_active
  limit 1;

  if v_ringing_status_id is not null then
    perform update_lead_status(p_lead_id, v_ringing_status_id, coalesce(p_note, 'Reassigned via Admin Review'));
  end if;

  insert into caller_assignment_history
    (lead_id, product_id, caller_id, employee_id, status, cycle_number, attempt_number, reason)
  values
    (p_lead_id, v_product_id, p_caller_id, p_caller_id, 'ringing', v_next_cycle, 1, 'Manually assigned via Admin Review');
end;
$$;

revoke execute on function admin_reassign_caller(uuid, uuid, text) from public, anon;
grant execute on function admin_reassign_caller(uuid, uuid, text) to authenticated, service_role;

create or replace function admin_resolve_review(p_lead_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_product_id uuid;
begin
  select product_id into v_product_id from leads where id = p_lead_id for update;
  if v_product_id is null then
    raise exception 'lead % not found', p_lead_id;
  end if;

  if v_actor is not null and not (is_admin() or (is_manager() and has_product_access(v_product_id))) then
    raise exception 'not authorized to resolve review for lead %', p_lead_id;
  end if;

  update leads set needs_admin_review = false where id = p_lead_id;

  update caller_assignment_history
  set completed = true, call_completed_at = now(), status = 'resolved',
      reason = coalesce(p_note, 'Resolved via Admin Review')
  where lead_id = p_lead_id and not completed;

  if p_note is not null and length(trim(p_note)) > 0 then
    insert into lead_notes (lead_id, note, created_by) values (p_lead_id, p_note, v_actor);
  end if;
end;
$$;

revoke execute on function admin_resolve_review(uuid, text) from public, anon;
grant execute on function admin_resolve_review(uuid, text) to authenticated, service_role;
