/*
# Create central platforms table

## Purpose
Central master table for platform management (Uber, Ola, Rapido, etc.).
Platform is a field in Directory records. This table replaces the previous
ad-hoc text-based platform values with a proper master table that supports
activation/deactivation and is referenced by Directory dropdowns and filters.

## New Table
- `platforms`
  - id (uuid, PK)
  - name (text, NOT NULL, UNIQUE) — e.g. "Uber", "Ola", "Rapido"
  - is_active (boolean, default true)
  - created_at (timestamptz)
  - updated_at (timestamptz)

## Indexes
- idx_platforms_status on is_active

## Security
- RLS enabled
- All authenticated users can SELECT (needed for directory dropdowns)
- Only admins can INSERT, UPDATE, DELETE (using existing is_admin() helper)

## Existing directory_entries.platform column
- NOT modified — it remains a text column storing the platform name string.
- The central platforms table provides the canonical list of valid options.
- Existing records with platform values not in the platforms table are preserved.
*/
CREATE TABLE IF NOT EXISTS platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_platforms_status ON platforms(is_active);

-- All authenticated users can read platforms (needed for dropdowns/filters)
DROP POLICY IF EXISTS "platforms_select" ON platforms;
CREATE POLICY "platforms_select" ON platforms FOR SELECT
  TO authenticated USING (true);

-- Admin-only CRUD
DROP POLICY IF EXISTS "platforms_insert" ON platforms;
CREATE POLICY "platforms_insert" ON platforms FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "platforms_update" ON platforms;
CREATE POLICY "platforms_update" ON platforms FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "platforms_delete" ON platforms;
CREATE POLICY "platforms_delete" ON platforms FOR DELETE
  TO authenticated USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_platforms_updated ON platforms;
CREATE TRIGGER trg_platforms_updated BEFORE UPDATE ON platforms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON platforms TO authenticated;
