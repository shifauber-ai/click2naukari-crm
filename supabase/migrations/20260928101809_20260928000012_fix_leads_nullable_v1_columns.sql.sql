/*
# Fix: Make V1-era NOT NULL columns on leads nullable

## Problem
The `leads` table has NOT NULL columns `platform_id` and `status_id` from the old V1 schema.
The frontend uses `platform` (text) and `status` (text), never these FK columns.
NOT NULL on them blocks every lead insert.

## Fix
- ALTER `platform_id` to be nullable
- ALTER `status_id` to be nullable
- Also make `name` nullable (frontend always sends it, but safety)
*/

ALTER TABLE public.leads ALTER COLUMN platform_id DROP NOT NULL;
ALTER TABLE public.leads ALTER COLUMN status_id DROP NOT NULL;
