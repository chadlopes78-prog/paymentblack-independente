-- Per-user payment processing configurations.
-- Each user can have one row with up to two independent gateway configs:
--   doc_*   — parsed from a provider-supplied config document
--   e2p_*   — E2Payments manual credential entry (M-Pesa + e-Mola)
-- Only the one(s) marked enabled will be used during checkout.

CREATE TABLE IF NOT EXISTS public.user_payment_configs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Document-based config
  doc_file_url            text,
  doc_file_name           text,
  doc_file_size           integer,
  doc_parsed_at           timestamptz,
  doc_credentials         jsonb,       -- extracted credentials (api_key, base_url, merchant_id…)
  doc_enabled             boolean     NOT NULL DEFAULT false,

  -- E2Payments manual config
  e2p_mpesa_client_id     text,
  e2p_mpesa_client_secret text,
  e2p_mpesa_wallet        text,
  e2p_emola_client_id     text,
  e2p_emola_client_secret text,
  e2p_emola_wallet        text,
  e2p_enabled             boolean     NOT NULL DEFAULT false,
  e2p_connection_status   text        NOT NULL DEFAULT 'untested'
                            CHECK (e2p_connection_status IN ('untested', 'connected', 'failed')),
  e2p_last_tested_at      timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id)
);

-- Row-level security: every user sees only their own row.
ALTER TABLE public.user_payment_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_full_access" ON public.user_payment_configs
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.user_payment_configs TO authenticated;
