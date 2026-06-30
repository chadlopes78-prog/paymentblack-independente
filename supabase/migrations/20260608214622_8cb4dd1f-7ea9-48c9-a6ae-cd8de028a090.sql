-- Rename columns in products table
ALTER TABLE public.products RENAME COLUMN pixel_id TO facebook_pixel_id;
ALTER TABLE public.products RENAME COLUMN pixel_token TO facebook_access_token;

-- Remove unused column
ALTER TABLE public.products DROP COLUMN IF EXISTS pixel_name;

-- Ensure pixel_configs table is correct (it seems it is, but let's be sure about permissions)
-- The table already exists based on my previous checks.
-- Just ensuring RLS is enabled and policies exist.

ALTER TABLE public.pixel_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own pixel configs" 
ON public.pixel_configs 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pixel_configs TO authenticated;
GRANT ALL ON public.pixel_configs TO service_role;
