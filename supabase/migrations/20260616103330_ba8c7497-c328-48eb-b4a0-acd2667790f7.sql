
-- 1. Lock down platform_settings visibility to authenticated users
DROP POLICY IF EXISTS "Anyone can view platform settings" ON public.platform_settings;
CREATE POLICY "Authenticated can view platform settings"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Fix privilege escalation: admin manage policy must rely on verified email, not profiles.role
DROP POLICY IF EXISTS "Admins can manage platform settings" ON public.platform_settings;
CREATE POLICY "Admins can manage platform settings"
  ON public.platform_settings
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = 'chadlopesff@gmail.com'::text)
  WITH CHECK ((auth.jwt() ->> 'email'::text) = 'chadlopesff@gmail.com'::text);

-- 3. Hide sensitive product columns from anonymous role (facebook_access_token, delivery_file_url)
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, user_id, name, description, price, image_url, category, warranty_days,
  custom_url, status, created_at, updated_at, facebook_pixel_id, delivery_type,
  delivery_link, access_link, support_phone, support_number
) ON public.products TO anon;
