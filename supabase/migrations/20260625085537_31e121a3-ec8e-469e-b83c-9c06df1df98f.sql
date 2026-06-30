
-- Real-time alert trigger on failed payments
CREATE OR REPLACE FUNCTION public.notify_payment_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text;
  v_reason text;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.status,'')) NOT IN ('failed','error','cancelled','canceled') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(OLD.status,'')) = lower(COALESCE(NEW.status,'')) THEN
    RETURN NEW;
  END IF;

  v_method := CASE
    WHEN NEW.payment_method ILIKE '%mpesa%' THEN 'M-Pesa'
    WHEN NEW.payment_method ILIKE '%emola%' THEN 'e-Mola'
    ELSE COALESCE(NEW.payment_method, 'Desconhecido')
  END;
  v_reason := COALESCE(NULLIF(trim(NEW.status_reason), ''), 'Sem motivo informado');

  INSERT INTO public.marketing_alerts (user_id, title, message, type)
  VALUES (
    NEW.user_id,
    'Pagamento falhou (' || v_method || ')',
    'Valor: ' || COALESCE(NEW.amount::text, '0') || ' MZN — Motivo: ' || v_reason,
    'payment_failure'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment_failure ON public.sales;
CREATE TRIGGER trg_notify_payment_failure
AFTER INSERT OR UPDATE OF status ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.notify_payment_failure();

-- Daily summary aggregator (per authenticated user; called by server route via admin client)
CREATE OR REPLACE FUNCTION public.get_payment_failure_summary(_user_id uuid, _since timestamptz)
RETURNS TABLE(payment_method text, status_reason text, failure_count bigint, total_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(payment_method, ''), 'desconhecido') AS payment_method,
    COALESCE(NULLIF(trim(status_reason), ''), 'Sem motivo informado') AS status_reason,
    COUNT(*)::bigint AS failure_count,
    COALESCE(SUM(amount), 0)::numeric AS total_amount
  FROM public.sales
  WHERE user_id = _user_id
    AND created_at >= _since
    AND lower(COALESCE(status, '')) IN ('failed','error','cancelled','canceled')
  GROUP BY 1, 2
  ORDER BY failure_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_failure_summary(uuid, timestamptz) TO authenticated, service_role;
