ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payout_number text,
  ADD COLUMN IF NOT EXISTS payout_method text;