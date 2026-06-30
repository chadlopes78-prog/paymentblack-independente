-- Update defaults for profiles table
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'pending';
