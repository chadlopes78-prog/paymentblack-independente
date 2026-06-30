-- Enhance traffic_events with more marketing metadata
ALTER TABLE public.traffic_events ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE public.traffic_events ADD COLUMN IF NOT EXISTS ad_id TEXT;
ALTER TABLE public.traffic_events ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.traffic_events ADD COLUMN IF NOT EXISTS medium TEXT;

-- Create marketing alerts table
CREATE TABLE IF NOT EXISTS public.marketing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL, -- 'warning', 'info', 'success', 'danger'
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_alerts TO authenticated;
GRANT ALL ON public.marketing_alerts TO service_role;
ALTER TABLE public.marketing_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own marketing alerts" 
ON public.marketing_alerts FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Create a view for funnel analysis joining with traffic_pages to get user_id
CREATE OR REPLACE VIEW public.funnel_stats AS
SELECT 
  tp.user_id,
  COUNT(CASE WHEN te.event_type = 'page_view' THEN 1 END) as total_visitors,
  COUNT(CASE WHEN te.event_type = 'view_content' THEN 1 END) as product_views,
  COUNT(CASE WHEN te.event_type = 'initiate_checkout' THEN 1 END) as checkout_initiations,
  COUNT(CASE WHEN te.event_type = 'purchase' THEN 1 END) as total_purchases
FROM public.traffic_events te
JOIN public.traffic_pages tp ON te.page_id = tp.id
GROUP BY tp.user_id;
