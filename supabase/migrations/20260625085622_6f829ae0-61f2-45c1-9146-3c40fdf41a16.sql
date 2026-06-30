
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-payment-summary') THEN
    PERFORM cron.unschedule('daily-payment-summary');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-payment-summary',
  '0 8 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--e8b965a9-3af1-4cb9-a3d5-c4a95caa6a79.lovable.app/api/public/hooks/daily-payment-summary',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaGlyYWxhZWtqZXVjYnh1ZHlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjI2MjIsImV4cCI6MjA5NzYzODYyMn0.iZ2386mUJ2-SZFd49zMKiMkcX1pzkqE349KpI1L25V4"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
