/*
# Fix: Drop conflicting old RPC overloads

## Problem
Old V2 migrations created overloads of update_lead_status and update_lead_platform_status
with `p_callback_time time without time zone` parameter type. Our clean baseline uses `text`.
PostgreSQL cannot resolve which function to call when both exist with compatible signatures.

## Fix
Drop the old overloads with `time without time zone` parameter, keeping only our `text` versions.
*/

DROP FUNCTION IF EXISTS public.update_lead_status(uuid, text, text, date, time without time zone) CASCADE;
DROP FUNCTION IF EXISTS public.update_lead_platform_status(uuid, text, text, text, date, time without time zone) CASCADE;
