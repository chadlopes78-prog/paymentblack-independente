-- 1. Profiles (Ensure it exists and has RLS)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can manage their own profile" ON public.profiles
        FOR ALL USING (auth.uid() = id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    image_url TEXT,
    category TEXT,
    warranty_days INTEGER DEFAULT 7,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can manage their own products" ON public.products
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. Customers
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can view their own customers" ON public.customers
        FOR SELECT USING (auth.uid() = merchant_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. Sales (replacing orders concept with requirement-aligned 'sales')
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers ON DELETE SET NULL,
    customer_name TEXT,
    customer_phone TEXT,
    amount DECIMAL(12,2) NOT NULL,
    payment_method TEXT, -- 'm-pesa', 'e-mola'
    transaction_id TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can view their own sales" ON public.sales
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.products 
                WHERE products.id = sales.product_id 
                AND products.user_id = auth.uid()
            )
        );
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5. Pixel Configs
CREATE TABLE IF NOT EXISTS public.pixel_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    pixel_id TEXT NOT NULL,
    pixel_type TEXT DEFAULT 'facebook', -- 'facebook', 'google-analytics', 'tiktok'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.pixel_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can manage their own pixels" ON public.pixel_configs
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6. Checkouts (Specific custom settings per product)
CREATE TABLE IF NOT EXISTS public.checkouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products ON DELETE CASCADE,
    title TEXT,
    subtitle TEXT,
    button_text TEXT DEFAULT 'Comprar Agora',
    primary_color TEXT DEFAULT '#2563eb',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.checkouts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
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
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 7. Platform Settings
CREATE TABLE IF NOT EXISTS public.platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    mpesa_shortcode TEXT,
    emola_id TEXT,
    business_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can manage their own settings" ON public.platform_settings
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
