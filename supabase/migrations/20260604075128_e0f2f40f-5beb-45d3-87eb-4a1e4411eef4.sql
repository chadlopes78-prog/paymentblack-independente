-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'merchant' CHECK (role IN ('admin', 'merchant')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Create products table
CREATE TABLE public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(12,2) NOT NULL,
  image_url TEXT,
  category TEXT,
  warranty_days INTEGER DEFAULT 7,
  custom_url TEXT UNIQUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own products" ON public.products
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create checkouts table (for customization)
CREATE TABLE public.checkouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products ON DELETE CASCADE UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563eb',
  banner_url TEXT,
  video_url TEXT,
  title TEXT,
  subtitle TEXT,
  guarantee_text TEXT,
  testimonials JSONB DEFAULT '[]'::jsonb,
  form_fields JSONB DEFAULT '{"name": true, "email": true, "phone": true}'::jsonb,
  button_text TEXT DEFAULT 'Comprar Agora',
  footer_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkouts TO authenticated;
GRANT SELECT ON public.checkouts TO anon;
GRANT ALL ON public.checkouts TO service_role;
ALTER TABLE public.checkouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage checkout for their products" ON public.checkouts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.products 
      WHERE products.id = checkouts.product_id 
      AND products.user_id = auth.uid()
    )
  );
CREATE POLICY "Public can view checkout" ON public.checkouts FOR SELECT USING (true);

-- Create orders table
CREATE TABLE public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products ON DELETE SET NULL,
  merchant_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('mpesa', 'emola')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'abandoned')),
  transaction_id TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view orders for their products" ON public.orders
  FOR ALL USING (merchant_id = auth.uid());

-- Create pixel_configs table
CREATE TABLE public.pixel_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  fb_pixel_id TEXT,
  fb_access_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pixel_configs TO authenticated;
GRANT ALL ON public.pixel_configs TO service_role;
ALTER TABLE public.pixel_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own pixel config" ON public.pixel_configs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create platform_settings (Admin only)
CREATE TABLE public.platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  transaction_fee_percentage DECIMAL(5,2) DEFAULT 5.00,
  is_registrations_open BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view platform settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage platform settings" ON public.platform_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function and trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_checkouts_updated_at BEFORE UPDATE ON public.checkouts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
