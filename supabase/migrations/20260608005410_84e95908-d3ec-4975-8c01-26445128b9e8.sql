-- 1. Fix handle_new_user_setup search_path
ALTER FUNCTION public.handle_new_user_setup() SET search_path = public;

-- 2. Revoke execute from public/authenticated on security definer functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM anon;

-- 3. Restrict System can insert profiles policy to only allow inserting own profile
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
CREATE POLICY "System can insert profiles" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- 4. Update the trigger function to be more robust
CREATE OR REPLACE FUNCTION public.handle_new_user_setup() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role, status)
  VALUES (
    NEW.id, 
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
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
