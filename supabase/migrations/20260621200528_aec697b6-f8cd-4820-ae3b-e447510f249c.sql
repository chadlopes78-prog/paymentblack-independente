
UPDATE public.profiles SET status = 'approved' WHERE status IS NULL OR status NOT IN ('approved','banned','rejected');

CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN NEW.email = 'chadlopesff@gmail.com' THEN 'admin' ELSE 'user' END,
    'approved'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$function$;
