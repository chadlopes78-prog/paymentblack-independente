CREATE OR REPLACE FUNCTION public.clean_invalid_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_invalid int := 0;
  v_dup_tx int := 0;
  v_dup_phone int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1) Invalid rows
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
  SELECT count(*) INTO v_invalid FROM del;

  -- 2) Duplicates by transaction_id (keep most recent approved/failed)
  WITH ranked AS (
    SELECT id,
      row_number() OVER (
        PARTITION BY transaction_id
        ORDER BY
          CASE WHEN lower(status) IN ('approved','paid','success') THEN 0
               WHEN lower(status) IN ('failed','error','cancelled','canceled') THEN 1
               ELSE 2 END,
          created_at DESC
      ) AS rn
    FROM public.sales
    WHERE user_id = v_user AND transaction_id IS NOT NULL AND length(trim(transaction_id)) > 0
  ),
  del AS (
    DELETE FROM public.sales s
    USING ranked r
    WHERE s.id = r.id AND r.rn > 1
    RETURNING 1
  )
  SELECT count(*) INTO v_dup_tx FROM del;

  -- 3) Duplicates by (customer_phone, product_id) keep latest
  WITH ranked AS (
    SELECT id,
      row_number() OVER (
        PARTITION BY customer_phone, product_id
        ORDER BY
          CASE WHEN lower(status) IN ('approved','paid','success') THEN 0
               WHEN lower(status) IN ('failed','error','cancelled','canceled') THEN 1
               ELSE 2 END,
          created_at DESC
      ) AS rn
    FROM public.sales
    WHERE user_id = v_user
      AND customer_phone IS NOT NULL AND length(trim(customer_phone)) > 0
      AND product_id IS NOT NULL
  ),
  del AS (
    DELETE FROM public.sales s
    USING ranked r
    WHERE s.id = r.id AND r.rn > 1
    RETURNING 1
  )
  SELECT count(*) INTO v_dup_phone FROM del;

  RETURN jsonb_build_object(
    'deleted', v_invalid + v_dup_tx + v_dup_phone,
    'invalid', v_invalid,
    'duplicates_transaction', v_dup_tx,
    'duplicates_phone', v_dup_phone
  );
END;
$$;