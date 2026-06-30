-- Fix for WARN: Function Search Path Mutable
ALTER FUNCTION public.handle_new_sale_notification() SET search_path = public;

-- Revoke execute from public to fix WARN 4, 5, 6, 7
REVOKE EXECUTE ON FUNCTION public.handle_new_sale_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_sale_notification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_sale_notification() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_sale_notification() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_sale_notification() TO postgres;
