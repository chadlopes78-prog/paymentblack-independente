-- 1. Update products table with Pixel and Delivery fields
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pixel_id TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pixel_token TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pixel_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'none' CHECK (delivery_type IN ('none', 'file', 'link', 'both'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS delivery_file_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS delivery_link TEXT;

-- 2. Create storage bucket for deliverables if it doesn't exist via SQL (though tool is preferred, bucket creation is handled separately, but we need policies)
-- The tool supabase--storage_create_bucket will be called separately.

-- 3. Grants and RLS for products are already enabled, but let's ensure service_role has access to new columns
GRANT ALL ON public.products TO service_role;
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
