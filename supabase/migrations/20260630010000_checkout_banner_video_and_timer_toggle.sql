-- Allow each product to choose image or video as checkout banner media,
-- and to enable/disable the countdown timer independently.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS checkout_banner_type text NOT NULL DEFAULT 'image';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS checkout_banner_video_url text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS timer_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_checkout_banner_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_checkout_banner_type_check
  CHECK (checkout_banner_type IN ('image', 'video'));

-- Public (anon) checkout needs to read these new columns.
GRANT SELECT (checkout_banner_type, checkout_banner_video_url, timer_enabled) ON public.products TO anon;
