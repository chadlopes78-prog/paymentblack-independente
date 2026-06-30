CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-webhook-queue') THEN
    PERFORM cron.unschedule('process-webhook-queue');
  END IF;
END $$;

DROP EXTENSION IF EXISTS pg_net CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.schedule(
    'process-webhook-queue',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://darkpaymz.lovable.app/api/public/hooks/process-webhook-queue',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWIiLCJyZWYiOiJ0aGdydXFpeHFmcnhmY2tqbHBoYiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzgwNTQ0MTI2LCJleHAiOjIwOTYxMjAxMjZ9.6nZwl3ZfSoLf86LraGHrGLmdj7Qq3t9qC06IwckZyGE"}'::jsonb,
      body := '{"source":"pg_cron"}'::jsonb
    ) AS request_id;
    $cron$
  );
END $$;