-- Enable pending-approval flow for new users.
-- Admin accounts (by email) are created with status='approved' + role='admin'.
-- Every other new account starts with status='pending' and requires explicit approval.

CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role   text;
  v_status text;
BEGIN
  IF NEW.email IN (
    'chadlopesff@gmail.com',
    'dercktuane@gmail.com',
    'chadlopes7@gmail.com'
  ) THEN
    v_role   := 'admin';
    v_status := 'approved';
  ELSE
    v_role   := 'user';
    v_status := 'pending';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    v_role,
    v_status
  )
  ON CONFLICT (id) DO UPDATE SET
    email     = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

  RETURN NEW;
END;
$$;

-- Ensure the existing admin account has the right role/status
UPDATE public.profiles
SET role = 'admin', status = 'approved'
WHERE email IN ('chadlopesff@gmail.com', 'dercktuane@gmail.com', 'chadlopes7@gmail.com');

-- Admin needs to read all profiles for the management panel.
-- We use a server-side (service_role) function for this, so no extra RLS policy needed.
-- Just ensure the service_role can SELECT/UPDATE profiles (it bypasses RLS by default).
