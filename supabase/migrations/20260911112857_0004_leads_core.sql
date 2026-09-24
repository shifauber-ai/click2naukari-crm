-- ============================================================================
-- 0004_leads_core.sql
-- ============================================================================

create sequence lead_code_seq;

create table leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text not null unique,

  product_id uuid not null references products(id),
  platform_id uuid not null references platforms(id),
  city_id uuid references cities(id),
  source_id uuid references sources(id),
  status_id uuid not null references statuses(id),

  assigned_employee_id uuid references employees(profile_id),
  assigned_caller_id uuid references employees(profile_id),

  needs_admin_review boolean not null default false,

  name text not null,
  mobile text not null,
  mobile_display text not null,
  alternate_mobile text,

  next_follow_up_at timestamptz,
  last_call_at timestamptz,

  directory_id uuid,
  directory_record_id uuid,
  import_batch_id uuid,

  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_leads_updated_at before update on leads
  for each row execute function set_updated_at();

create index idx_leads_mobile on leads(mobile);
create index idx_leads_lead_code on leads(lead_code);
create index idx_leads_product on leads(product_id);
create index idx_leads_platform on leads(platform_id);
create index idx_leads_city on leads(city_id);
create index idx_leads_source on leads(source_id);
create index idx_leads_assigned_employee on leads(assigned_employee_id);
create index idx_leads_assigned_caller on leads(assigned_caller_id);
create index idx_leads_status on leads(status_id);
create index idx_leads_created_at on leads(created_at desc);
create index idx_leads_updated_at on leads(updated_at desc);
create index idx_leads_admin_review on leads(product_id, needs_admin_review) where needs_admin_review;
create index idx_leads_follow_up on leads(next_follow_up_at) where next_follow_up_at is not null;
create index idx_leads_product_created on leads(product_id, created_at desc);

create or replace function next_lead_code(p_product_slug text)
returns text
language sql
as $$
  select upper(p_product_slug) || '-' || lpad(nextval('lead_code_seq')::text, 6, '0');
$$;

create or replace function set_lead_code()
returns trigger
language plpgsql
as $$
declare
  v_slug text;
begin
  if new.lead_code is null then
    select slug into v_slug from products where id = new.product_id;
    new.lead_code := next_lead_code(coalesce(v_slug, 'lead'));
  end if;
  return new;
end;
$$;
create trigger trg_leads_set_code before insert on leads
  for each row execute function set_lead_code();

create table lead_status_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  old_status_id uuid references statuses(id),
  new_status_id uuid not null references statuses(id),
  changed_by uuid references profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index idx_lead_status_history_lead on lead_status_history(lead_id, created_at desc);

create table lead_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  employee_id uuid references employees(profile_id),
  assigned_by uuid references profiles(id),
  reason text,
  is_current boolean not null default true,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);
create index idx_lead_assignments_lead on lead_assignments(lead_id, assigned_at desc);
create index idx_lead_assignments_employee on lead_assignments(employee_id);
create unique index uq_lead_assignments_one_current on lead_assignments(lead_id) where is_current;

create table lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  note text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_lead_notes_lead on lead_notes(lead_id, created_at desc);