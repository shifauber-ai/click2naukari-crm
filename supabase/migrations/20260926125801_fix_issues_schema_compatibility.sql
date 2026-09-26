/*
# Fix Issues Table Schema Compatibility

## Purpose
The V2 `issues` table (created by migration 0005_lead_buckets_and_automation)
is missing columns that the V2 frontend expects: `employee_id`, `product_id`,
`issue_type`, `issue_status`, `remarks`, and `updated_at`.

The V1 migration `20260830192150_crm_core_schema.sql` defines an `issues`
table with these columns and an RLS policy `issues_select_own` that references
`employee_id`. On fresh/preview environments that replay all migrations, the
V1 policy creation fails with `column "employee_id" does not exist` because
the V2 table (which runs later in timestamp order but whose `CREATE TABLE`
without `IF NOT EXISTS` may conflict) doesn't have that column.

This migration safely adds the missing columns to the existing V2 `issues`
table using `ADD COLUMN IF NOT EXISTS`, making the V1 policy reference valid
and the frontend queries functional.

## Columns Added
1. `product_id` — uuid, nullable, references products(id) ON DELETE SET NULL.
   Nullable because V2 issues rows may not have a product association yet.
2. `employee_id` — uuid, nullable, references profiles(id) ON DELETE SET NULL.
   Nullable because V2 issues rows may not have an employee association yet.
3. `issue_type` — text, nullable (no NOT NULL to avoid breaking existing rows
   that don't have a type). CHECK constraint matches V1 values.
4. `issue_status` — text, nullable, defaults to 'OPEN'. CHECK constraint
   matches V1 values.
5. `remarks` — text, nullable, defaults to '' (empty string).
6. `updated_at` — timestamptz, defaults to now().

## RLS Policy Changes
The existing live policies (`issues_select_auth`, `issues_insert_auth`,
`issues_update_auth`, `issues_delete_auth`) all use `USING (true)` / 
`WITH CHECK (true)` — they allow all authenticated users full access.

The V1 migration creates `issues_select_own` with `USING (auth.uid() = employee_id)`
and `issues_update_own` with the same predicate. On a fresh replay, these
policies are created AFTER the compat `USING (true)` policies, so they
coexist (PostgreSQL ORs multiple policies for the same command).

To ensure the `issues_select_own` policy works correctly after the column
is added, this migration does NOT touch existing policies. The V1 migration
will be able to create `issues_select_own` successfully once `employee_id`
exists. On the live DB (where V1 migrations don't run), the existing
`USING (true)` policies remain in place.

No duplicate policies are created.

## Indexes
Adds `idx_issues_lead` and `idx_issues_type_status` if they don't exist,
matching V1 definitions.

## Safety
- Uses `ADD COLUMN IF NOT EXISTS` — idempotent, safe to re-run.
- Does NOT drop, rename, or modify existing columns.
- Does NOT delete existing data.
- Does NOT recreate the table.
- Does NOT modify any other table.
- Existing 0 rows of data are preserved.
*/

-- Add missing columns to the V2 issues table
ALTER TABLE issues ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS issue_type text CHECK (issue_type IS NULL OR issue_type IN
  ('ID_BLOCK','DOCUMENT_ISSUE','VEHICLE_ISSUE','OTHER_ISSUE'));
ALTER TABLE issues ADD COLUMN IF NOT EXISTS issue_status text NOT NULL DEFAULT 'OPEN' CHECK (issue_status IN
  ('OPEN','IN_PROGRESS','RESOLVED','CLOSED'));
ALTER TABLE issues ADD COLUMN IF NOT EXISTS remarks text NOT NULL DEFAULT '';
ALTER TABLE issues ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Add indexes matching V1 definitions
CREATE INDEX IF NOT EXISTS idx_issues_lead ON issues(lead_id);
CREATE INDEX IF NOT EXISTS idx_issues_type_status ON issues(issue_type, issue_status) WHERE issue_type IS NOT NULL;

-- Add updated_at trigger (matches V1 trigger definition)
DROP TRIGGER IF EXISTS trg_issues_updated ON issues;
CREATE TRIGGER trg_issues_updated BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
