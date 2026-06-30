-- Update sales RLS policy to be more robust
DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;
CREATE POLICY "Users can view their own sales" ON public.sales
FOR SELECT TO authenticated
USING (
    user_id = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM products 
        WHERE products.id = sales.product_id 
        AND products.user_id = auth.uid()
    )
);

-- Ensure user_id index exists
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);

-- Improve get_dashboard_metrics to be more robust and handle potential nulls better
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_stats JSONB;
    v_chart JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Aggregate stats
    WITH filtered_sales AS (
        SELECT amount, status, created_at
        FROM sales
        WHERE user_id = v_user_id
          AND created_at >= p_start_date
          AND created_at <= p_end_date
    ),
    stats AS (
        SELECT
            COUNT(*)::int as total_transactions,
            COUNT(*) FILTER (WHERE status IN ('approved', 'paid', 'success'))::int as success_count,
            COUNT(*) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled'))::int as failed_count,
            COALESCE(SUM(amount), 0)::numeric as total_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('approved', 'paid', 'success')), 0)::numeric as received_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')), 0)::numeric as lost_value
        FROM filtered_sales
    ),
    daily_stats AS (
        SELECT 
            date_trunc('day', created_at) as day,
            COUNT(*) FILTER (WHERE status IN ('approved', 'paid', 'success'))::int as day_success,
            COUNT(*) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled'))::int as day_failed
        FROM filtered_sales
        GROUP BY 1
        ORDER BY 1
    ),
    chart_json AS (
        SELECT json_agg(json_build_object(
            'day', day,
            'sucesso', day_success,
            'falha', day_failed
        )) as data
        FROM daily_stats
    )
    SELECT row_to_json(s)::jsonb INTO v_stats FROM stats s;
    SELECT data INTO v_chart FROM chart_json;
    
    RETURN json_build_object(
        'stats', COALESCE(v_stats, '{"total_transactions": 0, "success_count": 0, "failed_count": 0, "total_value": 0, "received_value": 0, "lost_value": 0}'::jsonb),
        'chartData', COALESCE(v_chart, '[]'::jsonb)
    );
END;
$$;