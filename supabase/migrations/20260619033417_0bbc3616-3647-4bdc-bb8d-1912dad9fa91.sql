CREATE TABLE public.pushcut_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  user_id uuid,
  webhook_id uuid REFERENCES public.webhook_endpoints(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processing',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pushcut_logs_order_id_key UNIQUE (order_id),
  CONSTRAINT pushcut_logs_status_check CHECK (status IN ('processing', 'sent', 'failed'))
);

GRANT SELECT ON public.pushcut_logs TO authenticated;
GRANT ALL ON public.pushcut_logs TO service_role;

ALTER TABLE public.pushcut_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own pushcut logs"
  ON public.pushcut_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_pushcut_logs_updated_at
  BEFORE UPDATE ON public.pushcut_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pushcut_logs_user_created
  ON public.pushcut_logs(user_id, created_at DESC);
CREATE INDEX idx_pushcut_logs_webhook_created
  ON public.pushcut_logs(webhook_id, created_at DESC);