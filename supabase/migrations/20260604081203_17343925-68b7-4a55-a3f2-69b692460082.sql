-- Fix security issues for handle_new_user
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Revoke execute from public roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- Grant execute to service_role (needed for the trigger which runs as a superuser/service_role context often)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
