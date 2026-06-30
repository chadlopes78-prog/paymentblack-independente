-- Allow anonymous/public inserts into orders
CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT WITH CHECK (true);

-- Ensure service_role has all permissions (standard practice)
GRANT ALL ON public.orders TO service_role;
