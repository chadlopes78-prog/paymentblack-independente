
-- Helpful indexes for the reconciliation sweep + dashboards filtering by status/created_at
CREATE INDEX IF NOT EXISTS idx_sales_status_created_at ON public.sales (status, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_user_status_created_at ON public.sales (user_id, status, created_at DESC);

-- Schedule reconciliation every 3 minutes
DO $$
DECLARE
  v_url text := 'https://warm-cuddles.lovable.app/api/public/hooks/reconcile-pending-payments';
  v_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaGlyYWxhZWtqZXVjYnh1ZHlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjI2MjIsImV4cCI6MjA5NzYzODYyMn0.iZ2386mUJ2-SZFd49zMKiMkcX1pzkqE349KpI1L25V4';
BEGIN
  PERFORM cron.unschedule('reconcile-pending-payments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reconcile-pending-payments',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://warm-cuddles.lovable.app/api/public/hooks/reconcile-pending-payments?minutes=8',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaGlyYWxhZWtqZXVjYnh1ZHlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjI2MjIsImV4cCI6MjA5NzYzODYyMn0.iZ2386mUJ2-SZFd49zMKiMkcX1pzkqE349KpI1L25V4'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
