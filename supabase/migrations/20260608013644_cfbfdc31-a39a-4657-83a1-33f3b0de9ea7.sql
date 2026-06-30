-- Harden security definer functions
ALTER FUNCTION public.handle_new_user_setup() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user_setup() TO service_role;

ALTER FUNCTION public.handle_new_user() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

ALTER FUNCTION public.is_product_publicly_visible(uuid) SET search_path = public;

-- Hardening profiles update
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (
  auth.uid() = id AND 
  (
    auth.jwt() ->> 'email' = 'chadlopesff@gmail.com' OR 
    role = 'user' -- Non-admins can only set their role to 'user'
  )
);
