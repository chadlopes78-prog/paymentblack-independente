-- Revoke public access
REVOKE ALL ON FUNCTION public.get_dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM public;
REVOKE ALL ON FUNCTION public.get_dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;

-- Drop old function
DROP FUNCTION IF EXISTS public.get_dashboard_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

-- Create new secure function
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
    result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    WITH filtered_sales AS (
        SELECT amount, status
        FROM sales
        WHERE user_id = v_user_id
          AND created_at >= p_start_date
          AND created_at <= p_end_date
    ),
    stats AS (
        SELECT
            COUNT(*) as total_transactions,
            COUNT(*) FILTER (WHERE status IN ('approved', 'paid', 'success', 'paid')) as success_count,
            COUNT(*) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')) as failed_count,
            COALESCE(SUM(amount), 0) as total_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('approved', 'paid', 'success', 'paid')), 0) as received_value,
            COALESCE(SUM(amount) FILTER (WHERE status IN ('failed', 'error', 'cancelled', 'canceled')), 0) as lost_value
        FROM filtered_sales
    )
    SELECT row_to_json(s)::jsonb INTO result FROM stats s;
    
    RETURN result;
END;
$$;

-- Grant to roles
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- Revoke from public (anon) explicitly
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;