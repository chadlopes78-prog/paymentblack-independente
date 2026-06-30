
-- 1) products: hide sensitive merchant-config columns from anon (public can still read other columns)
REVOKE SELECT (facebook_access_token, facebook_pixel_id) ON public.products FROM anon;
REVOKE SELECT (facebook_access_token, facebook_pixel_id) ON public.products FROM PUBLIC;

-- 2) sales: ALWAYS derive user_id from the product, ignore caller-supplied value
CREATE OR REPLACE FUNCTION public.sales_set_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'sales.product_id is required';
  END IF;
  SELECT user_id INTO v_owner FROM public.products WHERE id = NEW.product_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'sales.user_id cannot be resolved from product %', NEW.product_id;
  END IF;
  -- Always overwrite to prevent a caller from associating a sale with an arbitrary merchant
  NEW.user_id := v_owner;
  RETURN NEW;
END;
$function$;

-- 3) platform_settings: allow signed-in users to read non-admin settings (UI needs flags like is_registrations_open)
DROP POLICY IF EXISTS "Authenticated can view platform settings" ON public.platform_settings;
CREATE POLICY "Authenticated can view platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (true);

-- 4) Lock down SECURITY DEFINER functions: revoke broad EXECUTE, grant only what's actually needed by callers.
-- Trigger functions (called by Postgres, not by API): revoke from anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_sale_notification() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_payment_failure() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_set_user_id() FROM anon, authenticated, PUBLIC;

-- RPCs intentionally callable by signed-in users (UI features). Revoke anon, keep authenticated.
REVOKE EXECUTE ON FUNCTION public.clean_invalid_sales() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wipe_all_sales() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_payment_failure_summary(uuid, timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.clean_invalid_sales() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wipe_all_sales() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_failure_summary(uuid, timestamptz) TO authenticated;
