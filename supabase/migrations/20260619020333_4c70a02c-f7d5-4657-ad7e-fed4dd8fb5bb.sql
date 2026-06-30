ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_deliveries_webhook_dedupe_key_uidx
  ON public.webhook_deliveries(webhook_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_payment_reference
  ON public.sales(payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_transaction_id
  ON public.sales(transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-webhook-queue') THEN
    PERFORM cron.unschedule('process-webhook-queue');
  END IF;

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