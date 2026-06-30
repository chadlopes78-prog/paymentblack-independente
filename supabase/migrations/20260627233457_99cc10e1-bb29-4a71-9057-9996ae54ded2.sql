
CREATE TABLE public.recovery_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  customer_phone text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_attempts_lookup_idx ON public.recovery_attempts (user_id, customer_phone, product_id, sent_at DESC);
GRANT SELECT, INSERT ON public.recovery_attempts TO authenticated;
GRANT ALL ON public.recovery_attempts TO service_role;
ALTER TABLE public.recovery_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own recovery attempts" ON public.recovery_attempts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
