-- Remove recursive policies that were causing "infinite recursion detected in policy" error
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Create new policies using auth.jwt() for the main admin email
-- This avoids querying the profiles table within its own policy

-- Policy for viewing profiles
CREATE POLICY "admin_all_access_select" 
ON public.profiles 
FOR SELECT 
USING (
  (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com') OR 
  (auth.uid() = id)
);

-- Policy for updating profiles (status, etc)
CREATE POLICY "admin_all_access_update" 
ON public.profiles 
FOR UPDATE 
USING (
  (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com') OR 
  (auth.uid() = id)
)
WITH CHECK (
  (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com') OR 
  (auth.uid() = id)
);

-- Policy for deleting profiles
CREATE POLICY "admin_all_access_delete" 
ON public.profiles 
FOR DELETE 
USING (
  (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com')
);

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Re-grant permissions just in case
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
