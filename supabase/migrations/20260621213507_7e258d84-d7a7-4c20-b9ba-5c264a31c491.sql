
-- Two admins; new users start as pending and must be approved
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN NEW.email IN ('chadlopesff@gmail.com','dercktuane@gmail.com') THEN 'admin' ELSE 'user' END,
    CASE WHEN NEW.email IN ('chadlopesff@gmail.com','dercktuane@gmail.com') THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$$;

-- Backfill: promote dercktuane if already registered
UPDATE public.profiles p
SET role = 'admin', status = 'approved'
FROM auth.users u
WHERE p.id = u.id AND u.email IN ('chadlopesff@gmail.com','dercktuane@gmail.com');
