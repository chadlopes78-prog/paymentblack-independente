-- 1. Add columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'banned'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 2. Ensure existing profiles have a default status if they are null
UPDATE public.profiles SET status = 'approved' WHERE status IS NULL;
UPDATE public.profiles SET role = 'merchant' WHERE role IS NULL; -- Existing users are merchants

-- 3. Update RLS for profiles
-- Drop existing policies if they exist (to be safe)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

-- Policy for admins to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'chadlopesff@gmail.com'
);

-- Policy for admins to update all profiles
CREATE POLICY "Admins can update all profiles" 
ON public.profiles FOR UPDATE 
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'chadlopesff@gmail.com'
);

-- Policy for system/auth to insert profiles (on signup)
CREATE POLICY "System can insert profiles" 
ON public.profiles FOR INSERT 
WITH CHECK (true);

-- 4. Create a function to handle new user role assignment
CREATE OR REPLACE FUNCTION public.handle_new_user_setup() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role, status)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();

-- 5. Set up grants
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
