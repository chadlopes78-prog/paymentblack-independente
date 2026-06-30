ALTER TABLE public.traffic_pages ADD COLUMN type TEXT NOT NULL DEFAULT 'normal' CHECK (type IN ('normal', 'quiz'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_pages TO authenticated;
GRANT ALL ON public.traffic_pages TO service_role;