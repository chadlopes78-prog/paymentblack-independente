
-- 1) Tighten public checkout SELECT to active products only.
-- Use a SECURITY DEFINER helper so anon can evaluate the product status
-- without needing a SELECT policy on products.
CREATE OR REPLACE FUNCTION public.is_product_publicly_visible(_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = _product_id AND COALESCE(status, 'active') = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_product_publicly_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_product_publicly_visible(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view checkout" ON public.checkouts;
CREATE POLICY "Public can view active product checkouts"
ON public.checkouts
FOR SELECT
TO anon, authenticated
USING (public.is_product_publicly_visible(product_id));

-- 2) Remove duplicate pixel_configs policy.
DROP POLICY IF EXISTS "Users can manage their own pixels" ON public.pixel_configs;
