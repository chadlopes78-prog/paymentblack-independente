-- Fix security issue
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- Add traffic_page_id to sales and orders
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS traffic_page_id UUID REFERENCES public.traffic_pages(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS traffic_page_id UUID REFERENCES public.traffic_pages(id);

-- Ensure service_role can see these
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.orders TO service_role;