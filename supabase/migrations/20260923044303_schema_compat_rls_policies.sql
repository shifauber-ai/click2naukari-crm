-- ============================================================
-- SCHEMA COMPATIBILITY LAYER — Part 2: RLS Policies
-- Add permissive policies for authenticated users on all tables.
-- The app uses client-side role checks; RLS prevents anon access.
-- ============================================================

DO $$
DECLARE
  t text;
  cmds text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  cmd text;
  pol_name text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    FOREACH cmd IN ARRAY cmds LOOP
      pol_name := t || '_' || lower(cmd) || '_auth';
      BEGIN
        IF cmd = 'SELECT' THEN
          EXECUTE format('CREATE POLICY %I ON %I FOR %s TO authenticated USING (true)', pol_name, t, cmd);
        ELSIF cmd = 'INSERT' THEN
          EXECUTE format('CREATE POLICY %I ON %I FOR %s TO authenticated WITH CHECK (true)', pol_name, t, cmd);
        ELSIF cmd = 'UPDATE' THEN
          EXECUTE format('CREATE POLICY %I ON %I FOR %s TO authenticated USING (true) WITH CHECK (true)', pol_name, t, cmd);
        ELSIF cmd = 'DELETE' THEN
          EXECUTE format('CREATE POLICY %I ON %I FOR %s TO authenticated USING (true)', pol_name, t, cmd);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Policy may already exist or table may not support this command
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;
