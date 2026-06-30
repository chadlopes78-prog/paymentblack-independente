CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Anyone can create sales" ON public.sales;
CREATE POLICY "Public can create valid sales" ON public.sales
FOR INSERT
TO anon, authenticated
WITH CHECK (
  product_id IS NOT NULL
  AND customer_name IS NOT NULL
  AND length(trim(customer_name)) BETWEEN 1 AND 100
  AND customer_phone IS NOT NULL
  AND customer_phone ~ '^\\+?[0-9 ()-]{9,20}$'
  AND amount > 0
  AND amount <= 500000
  AND payment_method IN ('mpesa', 'emola', 'm-pesa', 'e-mola')
  AND coalesce(status, 'pending') IN ('pending', 'paid', 'failed', 'completed', 'abandoned')
);

DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
CREATE POLICY "Public can create valid orders" ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  product_id IS NOT NULL
  AND merchant_id IS NOT NULL
  AND length(trim(customer_name)) BETWEEN 1 AND 100
  AND length(trim(customer_email)) BETWEEN 3 AND 255
  AND customer_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'
  AND customer_phone ~ '^\\+?[0-9 ()-]{9,20}$'
  AND amount > 0
  AND amount <= 500000
  AND payment_method IN ('mpesa', 'emola')
  AND coalesce(status, 'pending') IN ('pending', 'completed', 'failed', 'abandoned')
);

DROP POLICY IF EXISTS "Anyone can insert events" ON public.traffic_events;
CREATE POLICY "Public can insert valid traffic events" ON public.traffic_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  page_id IS NOT NULL
  AND event_type IN ('view', 'click', 'purchase')
);