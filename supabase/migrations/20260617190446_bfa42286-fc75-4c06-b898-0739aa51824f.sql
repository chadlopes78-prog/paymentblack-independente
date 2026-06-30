
-- 1) products: revoke sensitive columns from anon (RLS doesn't filter columns)
REVOKE SELECT (facebook_access_token, delivery_file_url) ON public.products FROM anon;

-- 2) platform_settings: drop overly broad SELECT, replace with admin-only
DROP POLICY IF EXISTS "Authenticated can view platform settings" ON public.platform_settings;
CREATE POLICY "Admins can view platform settings"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = 'chadlopesff@gmail.com'::text);

-- 3) app_config: add admin-only policies (table has RLS on but no policies)
DROP POLICY IF EXISTS "Admins can manage app_config" ON public.app_config;
CREATE POLICY "Admins can manage app_config"
  ON public.app_config
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = 'chadlopesff@gmail.com'::text)
  WITH CHECK ((auth.jwt() ->> 'email'::text) = 'chadlopesff@gmail.com'::text);

-- 4) profiles: tighten self-update so already-elevated rows can't be self-modified
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    AND (
      ((auth.jwt() ->> 'email'::text) = 'chadlopesff@gmail.com'::text)
      OR role = 'user'::text
    )
  )
  WITH CHECK (
    auth.uid() = id
    AND (
      ((auth.jwt() ->> 'email'::text) = 'chadlopesff@gmail.com'::text)
      OR role = 'user'::text
    )
  );

-- 5) realtime.messages: restrict channel subscriptions to authenticated users
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can receive realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated can receive realtime messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);
