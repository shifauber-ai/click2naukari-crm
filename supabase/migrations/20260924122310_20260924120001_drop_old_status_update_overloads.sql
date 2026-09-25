/*
# Drop old status update function overloads

## Purpose
Multiple migrations created overloaded versions of update_lead_status and
update_lead_platform_status with different parameter counts. PostgreSQL allows
function overloading (same name, different params), which caused RPC resolution
ambiguity — calls with 5 params could silently match a 3-param overload.

This migration drops all obsolete overloads so only the final signatures remain:
  - update_lead_status(uuid, text, text, date, time)
  - update_lead_platform_status(uuid, text, text, text, date, time)

## Changes
- DROP FUNCTION IF EXISTS for each old overload signature.
- No tables, columns, RLS, or data are modified.

## Security
- No security changes. Only function signatures are affected.
*/

-- Drop old update_lead_status overloads (final: uuid, text, text, date, time)
DROP FUNCTION IF EXISTS public.update_lead_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.update_lead_status(uuid, text);

-- Drop old update_lead_platform_status overloads (final: uuid, text, text, text, date, time)
DROP FUNCTION IF EXISTS public.update_lead_platform_status(uuid, text, text);
