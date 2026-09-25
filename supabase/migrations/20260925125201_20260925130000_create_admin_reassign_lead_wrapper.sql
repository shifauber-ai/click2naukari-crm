/*
# Create admin_reassign_lead Wrapper RPC

## Purpose
The frontend calls `admin_reassign_lead(p_lead_id, p_new_caller_id, p_new_status, p_remarks)` 
for single-lead assignment, but only `admin_reassign_caller(p_lead_id, p_caller_id, p_note)` 
exists in the database. This creates a thin wrapper that maps the frontend's parameter names 
to the existing function.

## New Functions
1. `admin_reassign_lead(uuid, uuid, text, text)` — Wrapper that calls `admin_reassign_caller`.

## Security
- SECURITY DEFINER, granted to authenticated.
- Internal authorization check delegated to `admin_reassign_caller` (which checks is_admin/is_manager).
*/

CREATE OR REPLACE FUNCTION public.admin_reassign_lead(
  p_lead_id uuid,
  p_new_caller_id uuid,
  p_new_status text DEFAULT NULL,
  p_remarks text DEFAULT 'Manual assignment'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM admin_reassign_caller(p_lead_id, p_new_caller_id, p_remarks);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reassign_lead(uuid, uuid, text, text) TO authenticated;