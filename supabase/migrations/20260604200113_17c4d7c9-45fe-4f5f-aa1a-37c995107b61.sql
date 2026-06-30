ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS support_phone TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT ALL ON public.products TO service_role;