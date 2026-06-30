
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bump_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bump_title text,
  ADD COLUMN IF NOT EXISTS bump_description text,
  ADD COLUMN IF NOT EXISTS bump_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS bump_image_url text,
  ADD COLUMN IF NOT EXISTS bump_button_text text DEFAULT 'Sim, quero adicionar!',
  ADD COLUMN IF NOT EXISTS bump_highlight_color text DEFAULT '#16a34a';

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS bump_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bump_amount numeric(12,2);
