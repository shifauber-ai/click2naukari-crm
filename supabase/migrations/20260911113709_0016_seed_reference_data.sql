-- ============================================================================
-- 0016_seed_reference_data.sql
-- Seeds ONLY the configuration the spec names explicitly as CURRENT values
-- of database-driven catalogs (products, platforms, their per-product
-- mapping, and platform-specific status lists — spec sections 5, 6, 9,
-- 29-32). This is not application mock data: it's the literal starting
-- configuration an Admin edits from here via the Products/Platforms
-- screens, exactly as spec section 6 says ("do not assume these are
-- permanently fixed"). Deliberately NOT seeded: cities, employees,
-- callers, leads, directories — that's the org's real operational data
-- and none of it is invented here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------------------
insert into products (slug, name, is_standard, has_payments, has_caller_queue, has_platforms_management, has_reports, has_employees_management, has_whatsapp, sort_order)
values
  ('car',   'Car',   true,  true,  true,  true,  true,  true,  false, 1),
  ('auto',  'Auto',  true,  false, true,  true,  true,  true,  false, 2),
  ('tempo', 'Tempo', true,  false, true,  true,  true,  true,  false, 3),
  ('bike',  'Bike',  true,  false, true,  true,  true,  true,  false, 4),
  ('hc',    'HC',    false, false, false, false, false, false, false, 5)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Platforms (global catalog)
-- ----------------------------------------------------------------------------
insert into platforms (slug, name) values
  ('uber',       'Uber'),
  ('uber_ft',    'Uber FT'),
  ('ola',        'Ola'),
  ('rapido',     'Rapido'),
  ('rapido_ft',  'Rapido FT')
on conflict (slug) do nothing;

-- Car: all five platforms (spec section 6 example, verbatim).
insert into product_platforms (product_id, platform_id, sort_order)
select p.id, pl.id, pl_order.ord
from products p
join (values ('uber',1), ('uber_ft',2), ('ola',3), ('rapido',4), ('rapido_ft',5)) as pl_order(slug, ord) on true
join platforms pl on pl.slug = pl_order.slug
where p.slug = 'car'
on conflict do nothing;

-- Auto/Tempo/Bike: same five platforms by default — spec explicitly leaves
-- this open ("can have the same or different platform combinations"); an
-- Admin/Manager can deactivate any product_platforms row per product from
-- the Platforms screen without a migration.
insert into product_platforms (product_id, platform_id, sort_order)
select p.id, pl.id, pl_order.ord
from products p
join (values ('uber',1), ('uber_ft',2), ('ola',3), ('rapido',4), ('rapido_ft',5)) as pl_order(slug, ord) on true
join platforms pl on pl.slug = pl_order.slug
where p.slug in ('auto', 'tempo', 'bike')
on conflict do nothing;

-- HC: Uber only, for now (spec section 30).
insert into product_platforms (product_id, platform_id, sort_order)
select p.id, pl.id, 1 from products p join platforms pl on pl.slug = 'uber' where p.slug = 'hc'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Statuses (deduplicated catalog) — codes match spec sections 9 and 32.
-- ----------------------------------------------------------------------------
insert into statuses (code, label, bucket, color, is_ringing, is_default_for_new, is_system) values
  ('ringing',          'Ringing',           null,                    'amber',  true,  false, true),
  ('id_done',          'ID Done',           'id_done',               'green',  false, false, false),
  ('other_hero',       'Other Hero',        'other_hero',            'purple', false, false, false),
  ('id_block',         'ID Block',          'issues',                'red',    false, false, false),
  ('company_vehicle',  'Company Vehicle',   'issues',                'red',    false, false, false),
  ('not_interested',   'Not Interested',    'closed_not_interested', 'slate',  false, false, false),
  ('interested',       'Interested',        'follow_up',             'sky',    false, false, false),
  ('callback',         'Callback',          'follow_up',             'sky',    false, false, false),
  ('existing',         'Existing',          null,                    'slate',  false, true,  false),
  ('fresh',            'Fresh',             null,                    'sky',    false, true,  false),
  ('other_no',         'Other No',          'issues',                'red',    false, false, false),
  ('payment_issue',    'Payment Issue',     'issues',                'red',    false, false, false),
  ('tag_added',        'Tag Added',         null,                    'sky',    false, true,  false)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Platform-specific status lists (spec section 9, verbatim).
-- Exactly one status per (product, platform) may be is_default_for_new,
-- and exactly one may be is_ringing — both enforced by app-level validation
-- on the Platforms admin screen, not a DB constraint (see 0002's note).
-- ----------------------------------------------------------------------------
create or replace function _seed_platform_statuses(p_product_slug text, p_platform_slug text, p_status_codes text[])
returns void language plpgsql as $$
declare
  v_product_id uuid;
  v_platform_id uuid;
  v_code text;
  v_ord int := 0;
begin
  select id into v_product_id from products where slug = p_product_slug;
  select id into v_platform_id from platforms where slug = p_platform_slug;
  foreach v_code in array p_status_codes loop
    v_ord := v_ord + 1;
    insert into platform_statuses (product_id, platform_id, status_id, sort_order)
    select v_product_id, v_platform_id, s.id, v_ord from statuses s where s.code = v_code
    on conflict do nothing;
  end loop;
end;
$$;

-- UBER: Ringing, ID Done, Other Hero, ID Block, Company Vehicle, Not Interested, Interested, Callback
select _seed_platform_statuses('car', 'uber', array['ringing','id_done','other_hero','id_block','company_vehicle','not_interested','interested','callback']);
select _seed_platform_statuses('auto', 'uber', array['ringing','id_done','other_hero','id_block','company_vehicle','not_interested','interested','callback']);
select _seed_platform_statuses('tempo', 'uber', array['ringing','id_done','other_hero','id_block','company_vehicle','not_interested','interested','callback']);
select _seed_platform_statuses('bike', 'uber', array['ringing','id_done','other_hero','id_block','company_vehicle','not_interested','interested','callback']);

-- UBER FT: its own configurable list — seeded the same as Uber by default,
-- independently editable from here on (spec section 9: "must have their own
-- configurable status lists").
select _seed_platform_statuses('car', 'uber_ft', array['ringing','id_done','other_hero','id_block','company_vehicle','not_interested','interested','callback']);
select _seed_platform_statuses('auto', 'uber_ft', array['ringing','id_done','other_hero','id_block','company_vehicle','not_interested','interested','callback']);
select _seed_platform_statuses('tempo', 'uber_ft', array['ringing','id_done','other_hero','id_block','company_vehicle','not_interested','interested','callback']);
select _seed_platform_statuses('bike', 'uber_ft', array['ringing','id_done','other_hero','id_block','company_vehicle','not_interested','interested','callback']);

-- RAPIDO: Existing, ID Done, Fresh, Other No
select _seed_platform_statuses('car', 'rapido', array['ringing','existing','id_done','fresh','other_no']);
select _seed_platform_statuses('auto', 'rapido', array['ringing','existing','id_done','fresh','other_no']);
select _seed_platform_statuses('tempo', 'rapido', array['ringing','existing','id_done','fresh','other_no']);
select _seed_platform_statuses('bike', 'rapido', array['ringing','existing','id_done','fresh','other_no']);

-- RAPIDO FT: own configurable list, seeded the same as Rapido by default.
select _seed_platform_statuses('car', 'rapido_ft', array['ringing','existing','id_done','fresh','other_no']);
select _seed_platform_statuses('auto', 'rapido_ft', array['ringing','existing','id_done','fresh','other_no']);
select _seed_platform_statuses('tempo', 'rapido_ft', array['ringing','existing','id_done','fresh','other_no']);
select _seed_platform_statuses('bike', 'rapido_ft', array['ringing','existing','id_done','fresh','other_no']);

-- OLA: Fresh, Existing, ID Done, Payment Issue, Ringing, Not Interested
select _seed_platform_statuses('car', 'ola', array['ringing','fresh','existing','id_done','payment_issue','not_interested']);
select _seed_platform_statuses('auto', 'ola', array['ringing','fresh','existing','id_done','payment_issue','not_interested']);
select _seed_platform_statuses('tempo', 'ola', array['ringing','fresh','existing','id_done','payment_issue','not_interested']);
select _seed_platform_statuses('bike', 'ola', array['ringing','fresh','existing','id_done','payment_issue','not_interested']);

-- HC on Uber: Tag Added, Ringing (spec section 32) — 'ringing' here is a
-- plain label only; HC has no caller queue so nothing ever rotates it.
select _seed_platform_statuses('hc', 'uber', array['tag_added','ringing']);

drop function _seed_platform_statuses(text, text, text[]);

-- ----------------------------------------------------------------------------
-- Default new-lead status per product+platform: the first non-ringing
-- status in the seeded order (Uber/Uber FT -> none explicit, so we mark
-- "Ringing" itself as also acceptable to start from since round-robin puts
-- every new lead into Ringing immediately anyway per spec section 11-12).
-- Rapido/Rapido FT default to "Fresh"; Ola defaults to "Fresh".
-- ----------------------------------------------------------------------------
-- 'existing' (Rapido/Rapido FT), 'fresh' (Ola) and 'tag_added' (HC) were
-- already marked is_default_for_new = true in the statuses insert above.
-- Uber/Uber FT have no natural "new" label distinct from Ringing — the
-- round-robin trigger (0007) sets every new lead straight to Ringing
-- regardless of is_default_for_new, so this only matters for leads created
-- with has_caller_queue = false or imported directly into a non-rotating
-- state; 'ringing' itself is left is_default_for_new = false intentionally
-- so the Platforms screen doesn't offer it as a manual "new lead" choice.

-- ----------------------------------------------------------------------------
-- Sources — the vocabulary the spec itself uses in its own examples
-- (section 20's "Source: ANFT"). Global (product_id null); an Admin/Manager
-- can add product-specific ones from the Sources screen.
-- ----------------------------------------------------------------------------
insert into sources (product_id, name) values
  (null, 'ANFT'),
  (null, 'Dealer'),
  (null, 'Partner'),
  (null, 'Showroom'),
  (null, 'Website'),
  (null, 'Referral'),
  (null, 'Walk-in'),
  (null, 'Import')
on conflict (name) where product_id is null do nothing;

-- ----------------------------------------------------------------------------
-- One caller_queue row per standard product, inactive members list to
-- start (empty) — Admin/Manager adds callers from the Caller Queue screen,
-- which is real operational setup, not something to fabricate here.
-- ----------------------------------------------------------------------------
insert into caller_queue (product_id)
select id from products where is_standard and has_caller_queue
on conflict (product_id) do nothing;
