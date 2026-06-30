-- 1. Add user_id to sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Backfill user_id from products
UPDATE public.sales s
SET user_id = p.user_id
FROM public.products p
WHERE s.product_id = p.id AND s.user_id IS NULL;

-- 3. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;

-- 4. Create function for backend metrics
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
    p_user_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSONB;
BEGIN
    WITH filtered_sales AS (
        SELECT amount, status
        FROM sales
        WHERE user_id = p_user_id
          AND created_at >= p_start_date
          AND created_at <= p_end_date
    ),
    stats AS (
        SELECT
            COUNT(*) as total_transactions,
            COUNT(*) FILTER (WHERE status IN ('approved', 'paid', 'success')) as success_count,
            COUNT(*) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')) as failed_count,
            COALESCE(SUM(amount), 0) as total_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('approved', 'paid', 'success')), 0) as received_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')), 0) as lost_value
        FROM filtered_sales
    )
    SELECT row_to_json(s)::jsonb INTO result FROM stats s;
    
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;