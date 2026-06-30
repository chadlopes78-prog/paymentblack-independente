-- Revoke execute from public/anon/authenticated for handle_new_user_setup
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_setup() TO service_role;

-- Also fix any other potentially exposed functions found earlier
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
