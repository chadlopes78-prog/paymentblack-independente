
-- 1. Backfill user_id from product owner (defensive; already 0 nulls)
UPDATE public.sales s
SET user_id = p.user_id
FROM public.products p
WHERE s.user_id IS NULL AND s.product_id = p.id;

-- 2. Delete unrecoverable rows (no user AND no product, or invalid amount)
DELETE FROM public.sales
WHERE (user_id IS NULL AND product_id IS NULL)
   OR amount IS NULL
   OR amount <= 0;

-- 3. Enforce user_id NOT NULL
ALTER TABLE public.sales ALTER COLUMN user_id SET NOT NULL;

-- 4. Trigger to auto-fill user_id from product on insert
CREATE OR REPLACE FUNCTION public.sales_set_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT user_id INTO NEW.user_id FROM public.products WHERE id = NEW.product_id;
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'sales.user_id cannot be resolved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_set_user_id ON public.sales;
CREATE TRIGGER trg_sales_set_user_id
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sales_set_user_id();

-- 5. Partial unique indexes for dedup
CREATE UNIQUE INDEX IF NOT EXISTS sales_transaction_id_unique
  ON public.sales (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_payment_reference_unique
  ON public.sales (payment_reference) WHERE payment_reference IS NOT NULL;

-- 6. Cleanup RPC: owner-scoped invalid record removal
CREATE OR REPLACE FUNCTION public.clean_invalid_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_deleted int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH del AS (
    DELETE FROM public.sales
    WHERE user_id = v_user
      AND (
        amount IS NULL OR amount <= 0
        OR product_id IS NULL
        OR customer_name IS NULL
        OR length(trim(customer_name)) = 0
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clean_invalid_sales() TO authenticated;
