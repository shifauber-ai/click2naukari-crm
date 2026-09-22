/*
# Fix: Employee permanent delete blocked by employee_targets.created_by FK

## Root cause
The employee_targets.created_by column references profiles(id) with
delete rule NO ACTION (the Postgres default). This blocks deletion of
any profile that has created target rows, causing the edge function's
profile delete to fail with a foreign key constraint violation.

## Fix
Change the FK from NO ACTION to SET NULL (created_by is already nullable).
This matches the existing pattern used by target_metrics.created_by,
lead_status_history.actor_id, audit_logs.actor_id, etc.

## Data safety
No data is lost. When an admin who created target entries is deleted,
the created_by column on those rows is set to NULL. The target entries
themselves (which belong to the employees they were assigned to) are
preserved. Employee-owned employee_targets rows are removed by the
existing CASCADE on employee_targets.employee_id.
*/

-- Drop the old NO ACTION constraint and recreate as SET NULL
ALTER TABLE employee_targets
  DROP CONSTRAINT IF EXISTS employee_targets_created_by_fkey;

ALTER TABLE employee_targets
  ADD CONSTRAINT employee_targets_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id)
  ON DELETE SET NULL;
