
ALTER TABLE public.webhook_endpoints
  ADD COLUMN IF NOT EXISTS product_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
