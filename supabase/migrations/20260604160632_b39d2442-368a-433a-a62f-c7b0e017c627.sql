-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS public.traffic_pages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    tracking_id TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_pages TO authenticated;
GRANT ALL ON public.traffic_pages TO service_role;
ALTER TABLE public.traffic_pages ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'traffic_pages' AND policyname = 'Users can manage their own traffic pages'
    ) THEN
        CREATE POLICY "Users can manage their own traffic pages" ON public.traffic_pages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.traffic_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    page_id UUID NOT NULL REFERENCES public.traffic_pages(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_events TO authenticated;
GRANT ALL ON public.traffic_events TO service_role;
GRANT INSERT ON public.traffic_events TO anon;
ALTER TABLE public.traffic_events ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'traffic_events' AND policyname = 'Users can view events for their pages'
    ) THEN
        CREATE POLICY "Users can view events for their pages" ON public.traffic_events FOR SELECT USING (
            EXISTS (SELECT 1 FROM public.traffic_pages WHERE id = page_id AND user_id = auth.uid())
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'traffic_events' AND policyname = 'Anyone can insert events'
    ) THEN
        CREATE POLICY "Anyone can insert events" ON public.traffic_events FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- Create trigger
DROP TRIGGER IF EXISTS update_traffic_pages_updated_at ON public.traffic_pages;
CREATE TRIGGER update_traffic_pages_updated_at BEFORE UPDATE ON public.traffic_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();