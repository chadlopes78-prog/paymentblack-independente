-- 1) Remove public anon access to products. Public reads now go exclusively
--    through the getPublicProduct server function which uses the service role
--    and only projects safe columns.
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
REVOKE SELECT ON public.products FROM anon;

-- 2) Enforce non-null merchant on every sale row.
UPDATE public.sales SET user_id = (SELECT user_id FROM public.products WHERE id = sales.product_id)
WHERE user_id IS NULL AND product_id IS NOT NULL;
DELETE FROM public.sales WHERE user_id IS NULL;
ALTER TABLE public.sales ALTER COLUMN user_id SET NOT NULL;