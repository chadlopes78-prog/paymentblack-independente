ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pushcut_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pushcut_template text NOT NULL DEFAULT 'simple';