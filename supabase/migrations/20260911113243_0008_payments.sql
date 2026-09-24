-- ============================================================================
-- 0008_payments.sql
-- Car-only today (spec section 14), but the table itself is product-scoped
-- rather than Car-specific — a trigger enforces products.has_payments
-- instead of the schema assuming only one product will ever collect
-- payments, so turning Payments on for another product later is a config
-- flip (products.has_payments = true), not a migration.
-- ============================================================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  product_id uuid not null references products(id),
  employee_id uuid not null references employees(profile_id),
  platform_id uuid references platforms(id),
  amount numeric(12, 2) not null check (amount >= 0),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_date date not null default current_date,
  payment_reference text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_payments_updated_at before update on payments
  for each row execute function set_updated_at();

create index idx_payments_lead on payments(lead_id);
create index idx_payments_product on payments(product_id);
create index idx_payments_employee on payments(employee_id);
create index idx_payments_platform on payments(platform_id);
create index idx_payments_date on payments(payment_date);
create index idx_payments_status on payments(payment_status);
-- The Payments screen's default view: this product, this month, newest first.
create index idx_payments_product_date on payments(product_id, payment_date desc);

create or replace function enforce_payment_product()
returns trigger
language plpgsql
as $$
declare
  v_has_payments boolean;
begin
  select has_payments into v_has_payments from products where id = new.product_id;
  if not coalesce(v_has_payments, false) then
    raise exception 'Product % does not have Payments enabled', new.product_id;
  end if;
  return new;
end;
$$;
create trigger trg_payments_enforce_product before insert or update on payments
  for each row execute function enforce_payment_product();

create table payment_history (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  old_status text,
  new_status text not null,
  note text,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);
create index idx_payment_history_payment on payment_history(payment_id, changed_at desc);

create or replace function log_payment_status_change()
returns trigger
language plpgsql
as $$
begin
  -- changed_by is whoever's session performed this write (auth.uid()), not
  -- payments.created_by — otherwise every later status change would be
  -- misattributed to whoever first logged the payment.
  if tg_op = 'INSERT' or old.payment_status is distinct from new.payment_status then
    insert into payment_history (payment_id, old_status, new_status, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.payment_status end,
            new.payment_status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_payments_log_status after insert or update on payments
  for each row execute function log_payment_status_change();
