-- Allow public read access to products so checkout links work
CREATE POLICY "Public read access for products" ON public.products FOR SELECT USING (true);

-- Allow public read access to checkouts so checkout settings can be loaded
CREATE POLICY "Public read access for checkouts" ON public.checkouts FOR SELECT USING (true);

-- Ensure anon and authenticated roles have select permission
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.checkouts TO anon, authenticated;
