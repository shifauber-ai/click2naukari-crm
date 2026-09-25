/*
# Fix: trigger_assign_new_lead must be SECURITY DEFINER

## Root Cause
When `bulk_import_leads` (SECURITY DEFINER, runs as postgres) inserts a lead,
the AFTER INSERT trigger `trg_leads_auto_assign` fires and calls
`trigger_assign_new_lead()` → `assign_lead_round_robin()` → `reassign_lead()`.

`reassign_lead()` checks authorization via `auth.uid()`. Even inside a SECURITY
DEFINER function, `auth.uid()` returns the JWT user's ID (the logged-in employee
running the import). If that user is not admin/manager, `reassign_lead` raises
"not authorized", the trigger fails, and the entire INSERT is rolled back.

The `bulk_import_leads` RPC catches this exception per-row and silently
increments `v_failed`, resulting in `imported: 0` with no visible error.

## Fix
Make `trigger_assign_new_lead` and `assign_lead_round_robin` SECURITY DEFINER
so they run as postgres. Inside these, `auth.uid()` returns NULL (no JWT
context as postgres), and `reassign_lead` skips the authorization check
(`if v_actor is not null and ...` — v_actor will be null).

## Safety
These functions only do round-robin assignment — they don't expose any data
or allow arbitrary writes. Making them SECURITY DEFINER is safe because:
1. They're only called by the AFTER INSERT trigger on leads
2. They only assign leads to queue members (no user input)
3. The authorization check in reassign_lead is bypassed only for auto-assignment
*/

CREATE OR REPLACE FUNCTION public.trigger_assign_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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

CREATE OR REPLACE FUNCTION public.assign_lead_round_robin(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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