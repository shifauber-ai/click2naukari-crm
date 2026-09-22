-- Fix bootstrap_profile: cast p_role text to app_role enum.
-- The enum values are lowercase (admin, manager, employee) but the app
-- passes uppercase (ADMIN, MANAGER, EMPLOYEE). Cast with lower() so both work.

CREATE OR REPLACE FUNCTION public.bootstrap_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text DEFAULT 'EMPLOYEE'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (p_user_id, p_email, p_full_name, lower(p_role)::app_role, true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_profile(uuid, text, text, text) TO authenticated, anon;
