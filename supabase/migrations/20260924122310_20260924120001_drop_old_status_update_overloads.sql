/*
# Drop old update_lead_status and update_lead_platform_status overloads

## Overview
Two functions have duplicate overloads from earlier migrations:
- `update_lead_status(uuid, uuid, text)` — old signature using a status ID
- `update_lead_platform_status(uuid, text, text, text)` — old signature without callback params

The newer versions with callback params are the ones the frontend uses.
Dropping the old overloads prevents ambiguity and ensures the correct
function is always called.

## Changes
- DROP FUNCTION `update_lead_status(uuid, uuid, text)` — old overload
- DROP FUNCTION `update_lead_platform_status(uuid, text, text, text)` — old overload without callback params

## Security
No security changes. The remaining functions retain their SECURITY DEFINER
status and existing grants.
*/

DROP FUNCTION IF EXISTS public.update_lead_status(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.update_lead_platform_status(uuid, text, text, text);
