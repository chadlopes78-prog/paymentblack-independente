-- Orders Table Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

DROP POLICY IF EXISTS "Admin full access orders" ON orders;
CREATE POLICY "Admin full access orders" ON orders 
FOR ALL 
TO authenticated 
USING (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com')
WITH CHECK (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com');

DROP POLICY IF EXISTS "Users manage own orders" ON orders;
CREATE POLICY "Users manage own orders" ON orders 
FOR ALL 
TO authenticated 
USING (auth.uid() = merchant_id)
WITH CHECK (auth.uid() = merchant_id);
