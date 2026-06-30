-- Profiles Table
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admin full access" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;

CREATE POLICY "Admin full access" ON profiles FOR ALL TO authenticated USING (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com') WITH CHECK (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com');
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated, anon WITH CHECK (auth.uid() = id OR (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com'));

-- Products Table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

DROP POLICY IF EXISTS "Admin full access products" ON products;
CREATE POLICY "Admin full access products" ON products FOR ALL TO authenticated USING (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com');

DROP POLICY IF EXISTS "Users manage own products" ON products;
CREATE POLICY "Users manage own products" ON products FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Sales Table
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;

DROP POLICY IF EXISTS "Admin full access sales" ON sales;
CREATE POLICY "Admin full access sales" ON sales FOR ALL TO authenticated USING (auth.jwt() ->> 'email' = 'chadlopesff@gmail.com');

-- Sales policy depends on existence of relationship, but since we have no user_id, we might need a join or another logic if it's meant for users. 
-- For now, we allow admin access.
