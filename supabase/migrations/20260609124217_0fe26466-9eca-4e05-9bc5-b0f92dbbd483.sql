
-- 1. Drop redundant unrestricted public policy on checkouts (the gated one remains)
DROP POLICY IF EXISTS "Public read access for checkouts" ON public.checkouts;

-- 2. Restrict public read on products to active only, and revoke sensitive columns from anon
DROP POLICY IF EXISTS "Public read access for products" ON public.products;

CREATE POLICY "Public can view active products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (COALESCE(status, 'active') = 'active');

-- Revoke sensitive column access from anonymous role
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (id, user_id, name, description, price, image_url, category, warranty_days, custom_url, status, created_at, updated_at)
ON public.products TO anon;

-- 3. Fix profiles privilege escalation: replace overly broad admin_all_access_update
DROP POLICY IF EXISTS "admin_all_access_update" ON public.profiles;
DROP POLICY IF EXISTS "admin_all_access_select" ON public.profiles;
DROP POLICY IF EXISTS "admin_all_access_delete" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;

-- Keep the safer "Users can update own profile" which already restricts role changes.
-- Add an admin-only update policy that allows changing role for admins only.
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((auth.jwt() ->> 'email') = 'chadlopesff@gmail.com')
WITH CHECK ((auth.jwt() ->> 'email') = 'chadlopesff@gmail.com');

CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING ((auth.jwt() ->> 'email') = 'chadlopesff@gmail.com');

-- 4. Fix SECURITY DEFINER view by recreating with security_invoker
DROP VIEW IF EXISTS public.funnel_stats;
CREATE VIEW public.funnel_stats
WITH (security_invoker = true)
AS
SELECT tp.user_id,
    count(CASE WHEN te.event_type = 'page_view' THEN 1 ELSE NULL::integer END) AS total_visitors,
    count(CASE WHEN te.event_type = 'view_content' THEN 1 ELSE NULL::integer END) AS product_views,
    count(CASE WHEN te.event_type = 'initiate_checkout' THEN 1 ELSE NULL::integer END) AS checkout_initiations,
    count(CASE WHEN te.event_type = 'purchase' THEN 1 ELSE NULL::integer END) AS total_purchases
FROM traffic_events te
JOIN traffic_pages tp ON te.page_id = tp.id
GROUP BY tp.user_id;

GRANT SELECT ON public.funnel_stats TO authenticated;

-- 5. Revoke EXECUTE on SECURITY DEFINER helpers from anon/authenticated.
-- These are used internally by RLS policies (which execute as definer regardless of grant)
-- and by server-side code using service_role.
REVOKE EXECUTE ON FUNCTION public.is_product_publicly_visible(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_sale_notification() FROM anon, authenticated, PUBLIC;
-- get_dashboard_metrics is intentionally callable by authenticated users (checks auth.uid() internally)

-- 6. Add explicit deny policy presence for app_config (RLS enabled, no policies = fully locked, which is intended)
-- No-op; service role bypasses RLS for trigger access via SECURITY DEFINER functions.
