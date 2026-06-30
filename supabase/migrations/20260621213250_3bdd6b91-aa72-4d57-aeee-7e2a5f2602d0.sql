GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT INSERT (id, full_name, avatar_url, pushcut_url, payout_number, payout_method, payout_mpesa, payout_emola, updated_at) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url, pushcut_url, payout_number, payout_method, payout_mpesa, payout_emola, updated_at, last_login) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
CREATE POLICY "System can insert profiles"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (auth.uid() = id);