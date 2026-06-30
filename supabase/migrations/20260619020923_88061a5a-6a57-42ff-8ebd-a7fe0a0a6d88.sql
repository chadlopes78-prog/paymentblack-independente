ALTER FUNCTION public.get_dashboard_metrics(timestamptz, timestamptz) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.is_product_publicly_visible(uuid) FROM authenticated;