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
            COUNT(*) as total_transactions,
            COUNT(*) FILTER (WHERE status IN ('approved', 'paid', 'success')) as success_count,
            COUNT(*) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')) as failed_count,
            COALESCE(SUM(amount), 0) as total_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('approved', 'paid', 'success')), 0) as received_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')), 0) as lost_value
        FROM filtered_sales
    ),
    daily_stats AS (
        SELECT 
            date_trunc('day', created_at) as day,
            COUNT(*) FILTER (WHERE status IN ('approved', 'paid', 'success')) as day_success,
            COUNT(*) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')) as day_failed
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
    
    RETURN json_build_object('stats', v_stats, 'chartData', COALESCE(v_chart, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;