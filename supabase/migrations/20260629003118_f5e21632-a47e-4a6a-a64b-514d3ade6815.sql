-- Replace the table-wide anon SELECT with explicit column-level grants.
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, user_id, name, description, price, image_url, checkout_banner_url,
  category, status, custom_url, warranty_days, delivery_type, thank_you_url,
  facebook_pixel_id, bump_enabled, bump_title, bump_description, bump_price,
  bump_image_url, bump_button_text, bump_highlight_color, created_at, updated_at
) ON public.products TO anon;