/*
# Fix: Remove restrictive leads status CHECK constraint

## Problem
The `leads_status_check` constraint only allows a fixed set of status values.
The frontend uses platform-specific statuses (like UBER_DONE, OLA_DONE, RAPIDO_DONE, etc.)
that aren't in the allowed list, causing insert/update failures.

## Fix
Drop the `leads_status_check` constraint. Status is a text column and the frontend
controls what values are valid. The database should not restrict platform-specific statuses.
*/

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
