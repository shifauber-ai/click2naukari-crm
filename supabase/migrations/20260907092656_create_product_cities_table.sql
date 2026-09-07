/*
# Create product_cities table for per-product city management

## Purpose
Allows admin to manage cities per product (e.g. CAR cities like Mumbai, Pune, Thane).
Cities can be activated/deactivated. Only active cities appear in lead city dropdowns.
Existing leads with inactive cities are preserved and remain visible.

## New Table
- `product_cities`
  - id (uuid, PK)
  - product_id (uuid, FK to products, NOT NULL)
  - city_name (text, NOT NULL)
  - is_active (boolean, default true)
  - created_at (timestamptz)
  - updated_at (timestamptz)
  - UNIQUE(product_id, city_name)

## Indexes
- idx_product_cities_product on product_id
- idx_product_cities_status on is_active
- idx_product_cities_product_active on (product_id, is_active)

## Security
- RLS enabled
- Admin-only CRUD (select, insert, update, delete)
- All employees can SELECT (needed for city dropdowns in employee pages)
*/

CREATE TABLE IF NOT EXISTS product_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  city_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, city_name)
);
ALTER TABLE product_cities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_product_cities_product ON product_cities(product_id);
CREATE INDEX IF NOT EXISTS idx_product_cities_status ON product_cities(is_active);
CREATE INDEX IF NOT EXISTS idx_product_cities_product_active ON product_cities(product_id, is_active);

-- Admin full CRUD
DROP POLICY IF EXISTS "product_cities_admin_select" ON product_cities;
CREATE POLICY "product_cities_admin_select" ON product_cities FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "product_cities_admin_insert" ON product_cities;
CREATE POLICY "product_cities_admin_insert" ON product_cities FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "product_cities_admin_update" ON product_cities;
CREATE POLICY "product_cities_admin_update" ON product_cities FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "product_cities_admin_delete" ON product_cities;
CREATE POLICY "product_cities_admin_delete" ON product_cities FOR DELETE
  TO authenticated USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_product_cities_updated ON product_cities;
CREATE TRIGGER trg_product_cities_updated BEFORE UPDATE ON product_cities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON product_cities TO authenticated, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
