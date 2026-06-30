ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_payment_confirmed_at ON public.sales (payment_confirmed_at) WHERE payment_confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_payment_failed_at ON public.sales (payment_failed_at) WHERE payment_failed_at IS NOT NULL;