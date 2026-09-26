-- Restore the bootstrap_profile function that was defined in migration
-- 20260830192237 but is missing from the live database. The crm-admin-users
-- edge function calls this RPC to create the profiles row after creating
-- a new auth user. Without it, employee creation fails silently.

CREATE OR REPLACE FUNCTION public.bootstrap_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text DEFAULT 'employee'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (p_user_id, p_email, p_full_name, p_role, true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_profile(uuid, text, text, text) TO authenticated, anon;
