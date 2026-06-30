ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_reference TEXT;
-- Grant access to authenticated and anon (for checkout)
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.sales TO authenticated;
GRANT ALL ON public.sales TO anon;
