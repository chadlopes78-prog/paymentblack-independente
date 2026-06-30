-- 1. Hardening sales
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can create sales" ON public.sales;
DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;

-- Allow guest checkout (INSERT)
CREATE POLICY "Anyone can create sales" ON public.sales FOR INSERT WITH CHECK (true);

-- Only merchant (owner of the product) can view the sale
CREATE POLICY "Users can view their own sales" ON public.sales
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.products 
            WHERE products.id = sales.product_id 
            AND products.user_id = auth.uid()
        )
    );

-- 2. Hardening customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can manage their own customers" ON public.customers;

CREATE POLICY "Users can manage their own customers" ON public.customers
    FOR ALL USING (auth.uid() = merchant_id) WITH CHECK (auth.uid() = merchant_id);

-- 3. Hardening checkouts
ALTER TABLE public.checkouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view checkout" ON public.checkouts;
DROP POLICY IF EXISTS "Users can manage their own checkouts" ON public.checkouts;
DROP POLICY IF EXISTS "Users can manage checkout for their products" ON public.checkouts;

-- Public read access for checkout pages
CREATE POLICY "Public can view checkout" ON public.checkouts FOR SELECT USING (true);

-- Management only for product owner
CREATE POLICY "Users can manage their own checkouts" ON public.checkouts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.products 
            WHERE products.id = checkouts.product_id 
            AND products.user_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.products 
            WHERE products.id = checkouts.product_id 
            AND products.user_id = auth.uid()
        )
    );

-- 4. Grant minimum necessary permissions to anon
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.checkouts TO anon;
GRANT INSERT ON public.sales TO anon;
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.checkouts TO service_role;
