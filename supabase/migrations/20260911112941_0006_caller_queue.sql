-- ============================================================================
-- 0006_caller_queue.sql
-- ============================================================================

create table caller_queue (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references products(id) on delete cascade,
  rotation_seconds int not null default 60,
  is_active boolean not null default true,
  last_assigned_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_caller_queue_updated_at before update on caller_queue
  for each row execute function set_updated_at();

create table caller_queue_members (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references caller_queue(id) on delete cascade,
  employee_id uuid not null references employees(profile_id) on delete cascade,
  position int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (queue_id, employee_id),
  unique (queue_id, position) deferrable initially deferred
);
create index idx_caller_queue_members_queue on caller_queue_members(queue_id, is_active, position);
create index idx_caller_queue_members_employee on caller_queue_members(employee_id);
create trigger trg_caller_queue_members_updated_at before update on caller_queue_members
  for each row execute function set_updated_at();

alter table caller_queue
  add constraint fk_caller_queue_last_member
  foreign key (last_assigned_member_id) references caller_queue_members(id) on delete set null;

create table caller_assignment_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  product_id uuid not null references products(id),
  caller_id uuid not null references employees(profile_id),
  employee_id uuid references employees(profile_id),
  assigned_at timestamptz not null default now(),
  call_started_at timestamptz,
  call_completed_at timestamptz,
  status text not null default 'ringing',
  cycle_number int not null,
  attempt_number int not null,
  completed boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
create index idx_caller_history_lead on caller_assignment_history(lead_id, cycle_number, attempt_number);
create index idx_caller_history_caller on caller_assignment_history(caller_id);
create index idx_caller_history_employee on caller_assignment_history(employee_id);
create index idx_caller_history_product on caller_assignment_history(product_id);
create index idx_caller_history_assigned_at on caller_assignment_history(assigned_at);
create index idx_caller_history_pending on caller_assignment_history(product_id, assigned_at)
  where not completed;