-- Enable RLS on all public tables that don't have it enabled yet.
-- The DO block above already created policies for all tables targeting
-- the authenticated role. But RLS itself was not enabled on tables
-- from the original 0001-0017 migrations (leads, products, profiles, etc.).

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
