-- ============================================================
-- 1. LIMPAR TODOS OS DADOS (plataforma em estado zero)
-- ============================================================
-- Desativar constraints temporariamente para truncate cascadeado
TRUNCATE TABLE public.sales RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.checkouts RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.orders RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.pixel_configs RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.products RESTART IDENTITY CASCADE;

-- Apagar notificações se existir
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    EXECUTE 'TRUNCATE TABLE public.notifications RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- Apagar recuperações se existir
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'recovery_messages') THEN
    EXECUTE 'TRUNCATE TABLE public.recovery_messages RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- Apagar logs de tráfego se existir
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'traffic_pages') THEN
    EXECUTE 'TRUNCATE TABLE public.traffic_pages RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- Apagar perfis não-admin (auth.users são gerenciados pelo Supabase Auth)
DELETE FROM public.profiles
WHERE email NOT IN ('chadlopesff@gmail.com', 'dercktuane@gmail.com');

-- ============================================================
-- 2. REMOVER FLUXO DE APROVAÇÃO — todos os novos usuários
--    entram direto com status 'approved'
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN NEW.email IN ('chadlopesff@gmail.com','dercktuane@gmail.com') THEN 'admin' ELSE 'user' END,
    'approved'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. ACESSO PÚBLICO AOS PRODUTOS (checkout sem service_role)
--    Permite que o browser leia produtos ativos diretamente
-- ============================================================
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.pixel_configs TO anon;

-- Remover política antiga se existir
DROP POLICY IF EXISTS "Public can view active products" ON public.products;

-- Nova política: qualquer visitante pode ver produtos ativos
CREATE POLICY "Public can view active products"
  ON public.products
  FOR SELECT
  TO anon
  USING (status = 'active');

-- Pixel configs: visitantes podem ler configs de pixel
DROP POLICY IF EXISTS "Public can view pixel configs" ON public.pixel_configs;
CREATE POLICY "Public can view pixel configs"
  ON public.pixel_configs
  FOR SELECT
  TO anon
  USING (true);
