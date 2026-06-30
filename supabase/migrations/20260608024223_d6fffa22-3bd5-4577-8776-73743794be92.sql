-- 1. Add email column to profiles if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email') THEN
        ALTER TABLE public.profiles ADD COLUMN email TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);
    END IF;
END $$;

-- 2. Update role constraint to allow 'user'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'merchant', 'user'));

-- 3. Recreate the handle_new_user_setup function with improved logic
CREATE OR REPLACE FUNCTION public.handle_new_user_setup() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, status)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 
    NEW.raw_user_meta_data->>'avatar_url',
    CASE 
      WHEN NEW.email = 'chadlopesff@gmail.com' THEN 'admin'
      ELSE 'user'
    END,
    CASE 
      WHEN NEW.email = 'chadlopesff@gmail.com' THEN 'approved'
      ELSE 'pending'
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$$;

-- 4. Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();

-- 5. Backfill email for existing profiles (optional but good)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- 6. Fix permissions
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
