-- Diagnostic log for every request/response exchanged with a payment
-- gateway (E2Payments today, extensible to others). Admin-only reads —
-- this can contain gateway response payloads, so it must never be
-- readable by regular sellers or anon.
CREATE TABLE IF NOT EXISTS public.payment_gateway_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        uuid        REFERENCES public.sales(id) ON DELETE SET NULL,
  gateway        text        NOT NULL DEFAULT 'e2payments',
  direction      text        NOT NULL CHECK (direction IN ('oauth_token', 'payment_request')),
  endpoint       text,
  http_status    integer,
  duration_ms    integer,
  ok             boolean,
  error          text,
  -- Truncated response body for diagnosis. Never store client_secret here.
  response_body  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_gateway_logs_sale_id_idx ON public.payment_gateway_logs (sale_id);
CREATE INDEX IF NOT EXISTS payment_gateway_logs_created_at_idx ON public.payment_gateway_logs (created_at DESC);

ALTER TABLE public.payment_gateway_logs ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated at all: only the service role (used
-- by Netlify Functions with the service key) can read or write. Admin
-- access goes through api-admin-payment-logs.ts, which uses the service
-- role after verifying the caller's email server-side.
REVOKE ALL ON public.payment_gateway_logs FROM anon, authenticated;
GRANT ALL ON public.payment_gateway_logs TO service_role;

-- Keep the table small: auto-delete anything older than 30 days.
-- (Run manually or wire to a scheduled function later if needed.)
