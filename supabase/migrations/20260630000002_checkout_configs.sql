CREATE TABLE IF NOT EXISTS public.checkout_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id)
);

ALTER TABLE public.checkout_configs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkout_configs TO authenticated;
GRANT SELECT ON public.checkout_configs TO anon;
GRANT ALL ON public.checkout_configs TO service_role;

CREATE POLICY "Users can manage checkout config for their products"
  ON public.checkout_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products WHERE products.id = checkout_configs.product_id AND products.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products WHERE products.id = checkout_configs.product_id AND products.user_id = auth.uid())
  );

CREATE POLICY "Public can view checkout configs"
  ON public.checkout_configs
  FOR SELECT
  TO anon
  USING (true);
