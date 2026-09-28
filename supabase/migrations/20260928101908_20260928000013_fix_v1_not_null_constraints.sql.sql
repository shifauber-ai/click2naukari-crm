/*
# Fix: Drop V1-era NOT NULL constraints blocking RPC inserts

## Problem
Several tables have V1-era NOT NULL columns (FKs to old V1 tables like statuses, platforms)
that the clean backend's RPC functions don't populate because they use text columns instead.

## Fix
Make the following V1-era columns nullable so RPC inserts work:

### lead_status_history
- new_status_id (V1 FK to statuses table, RPCs use new_status text)

### lead_platform_status
- product_id (V1 FK, not always set by RPCs that only know lead_id + platform)

### scheduled_transitions
- expected_status (not always known at insert time)
- next_action_at (not always known at insert time)
- transition_type (should have default)
*/

ALTER TABLE public.lead_status_history ALTER COLUMN new_status_id DROP NOT NULL;
ALTER TABLE public.lead_platform_status ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.scheduled_transitions ALTER COLUMN expected_status DROP NOT NULL;
ALTER TABLE public.scheduled_transitions ALTER COLUMN next_action_at DROP NOT NULL;
ALTER TABLE public.scheduled_transitions ALTER COLUMN transition_type SET DEFAULT 'RINGING_ROTATION';
