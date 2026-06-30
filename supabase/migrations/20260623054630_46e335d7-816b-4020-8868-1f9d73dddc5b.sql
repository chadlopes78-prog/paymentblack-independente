CREATE OR REPLACE FUNCTION public.wipe_all_sales()
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
    DELETE FROM public.sales WHERE user_id = v_user RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wipe_all_sales() TO authenticated;