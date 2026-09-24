-- ============================================================================
-- 0010_hc.sql
-- HC is completely separate (spec section 29): its own table with its own
-- field set, no caller queue, no employee assignment, no payments, no
-- platform management UI (platform is fixed to Uber for now but still
-- database-driven — see 0016 seed — so adding a second HC platform later
-- needs no migration). Explicitly: no WhatsApp field anywhere on this
-- table or its UI.
-- ============================================================================

create table hc_leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text not null unique,

  mobile text not null,
  mobile_display text not null,
  driver_name text not null,
  vehicle_number text,
  dl_number text,
  license_number text,
  total_trips int not null default 0,

  city_id uuid references cities(id),
  platform_id uuid references platforms(id),
  status_id uuid not null references statuses(id),

  import_batch_id uuid,  -- fk added in 0011_import.sql once import_batches exists

  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_hc_leads_updated_at before update on hc_leads
  for each row execute function set_updated_at();

create index idx_hc_leads_mobile on hc_leads(mobile);
create index idx_hc_leads_lead_code on hc_leads(lead_code);
create index idx_hc_leads_city on hc_leads(city_id);
create index idx_hc_leads_platform on hc_leads(platform_id);
create index idx_hc_leads_status on hc_leads(status_id);
create index idx_hc_leads_created_at on hc_leads(created_at desc);
create index idx_hc_leads_updated_at on hc_leads(updated_at desc);

create sequence hc_lead_code_seq;
create or replace function set_hc_lead_code()
returns trigger
language plpgsql
as $$
begin
  if new.lead_code is null then
    new.lead_code := 'HC-' || lpad(nextval('hc_lead_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
create trigger trg_hc_leads_set_code before insert on hc_leads
  for each row execute function set_hc_lead_code();

-- HC's status history mirrors leads' (spec: never destroy history on
-- status change) — a lighter version since HC has no bucket automation.
create table hc_lead_status_history (
  id uuid primary key default gen_random_uuid(),
  hc_lead_id uuid not null references hc_leads(id) on delete cascade,
  old_status_id uuid references statuses(id),
  new_status_id uuid not null references statuses(id),
  changed_by uuid references profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index idx_hc_lead_status_history_lead on hc_lead_status_history(hc_lead_id, created_at desc);

-- Same self-authorizing pattern as update_lead_status()/reassign_lead()
-- (0005): no trusted p_changed_by parameter — auth.uid() supplies the
-- actor, and a real signed-in caller must be Admin or hold product access
-- to HC (hc_product_id(), defined in 0014 — a forward reference that's
-- fine in plpgsql since the body isn't resolved until first execution,
-- long after all migrations have run). Without this, any authenticated
-- user could call this SECURITY DEFINER function directly via
-- supabase.rpc() and both edit HC leads outside their scope and forge
-- who made the change.
create or replace function update_hc_lead_status(
  p_hc_lead_id uuid, p_new_status_id uuid, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old_status_id uuid;
  v_exists boolean;
begin
  select true, status_id into v_exists, v_old_status_id from hc_leads where id = p_hc_lead_id for update;
  if not coalesce(v_exists, false) then
    raise exception 'hc_lead % not found', p_hc_lead_id;
  end if;

  if v_actor is not null and not (is_admin() or has_product_access(hc_product_id())) then
    raise exception 'not authorized to change status of HC lead %', p_hc_lead_id;
  end if;

  update hc_leads set status_id = p_new_status_id where id = p_hc_lead_id;
  insert into hc_lead_status_history (hc_lead_id, old_status_id, new_status_id, changed_by, note)
  values (p_hc_lead_id, v_old_status_id, p_new_status_id, v_actor, p_note);
end;
$$;

revoke execute on function update_hc_lead_status(uuid, uuid, text) from public, anon;
grant execute on function update_hc_lead_status(uuid, uuid, text) to authenticated, service_role;
