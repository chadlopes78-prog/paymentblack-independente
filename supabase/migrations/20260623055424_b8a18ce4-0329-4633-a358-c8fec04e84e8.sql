
-- 1) is_product_publicly_visible: SECURITY DEFINER -> INVOKER
CREATE OR REPLACE FUNCTION public.is_product_publicly_visible(_product_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = _product_id AND COALESCE(status, 'active') = 'active'
  );
$function$;

-- 2) Products: restrict public-view policy to anon role only,
--    then revoke sensitive columns from anon. Authenticated owners keep full access via their own policies.
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products"
  ON public.products
  FOR SELECT
  TO anon
  USING (COALESCE(status, 'active') = 'active');

REVOKE SELECT (
  facebook_access_token,
  facebook_pixel_id,
  access_link,
  delivery_link,
  delivery_file_url,
  support_phone,
  support_number
) ON public.products FROM anon;

-- 3) Customers: restrict policy to authenticated only
DROP POLICY IF EXISTS "Users can manage their own customers" ON public.customers;
CREATE POLICY "Users can manage their own customers"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (auth.uid() = merchant_id)
  WITH CHECK (auth.uid() = merchant_id);

-- 4) Orders: restrict anon-insertable status to 'pending'
DROP POLICY IF EXISTS "Public can create valid orders" ON public.orders;
CREATE POLICY "Public can create valid orders"
  ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    product_id IS NOT NULL
    AND merchant_id IS NOT NULL
    AND length(trim(customer_name)) BETWEEN 1 AND 100
    AND length(trim(customer_email)) BETWEEN 3 AND 255
    AND customer_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    AND customer_phone ~ '^\+?[0-9 ()-]{9,20}$'
    AND amount > 0 AND amount <= 500000
    AND payment_method = ANY (ARRAY['mpesa','emola'])
    AND COALESCE(status, 'pending') = 'pending'
  );

-- 5) Sales: bind user_id to product owner and restrict status to 'pending'
DROP POLICY IF EXISTS "Public can create valid sales" ON public.sales;
CREATE POLICY "Public can create valid sales"
  ON public.sales
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    product_id IS NOT NULL
    AND customer_name IS NOT NULL
    AND length(trim(customer_name)) BETWEEN 1 AND 100
    AND customer_phone IS NOT NULL
    AND customer_phone ~ '^\+?[0-9 ()-]{9,20}$'
    AND amount > 0 AND amount <= 500000
    AND payment_method = ANY (ARRAY['mpesa','emola','m-pesa','e-mola'])
    AND COALESCE(status, 'pending') = 'pending'
    AND (
      user_id IS NULL
      OR user_id = (SELECT p.user_id FROM public.products p WHERE p.id = sales.product_id)
    )
  );

-- 6) Webhook endpoints: hide `secret` column from authenticated SELECT.
--    Service role retains full access for dispatch.
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated;
