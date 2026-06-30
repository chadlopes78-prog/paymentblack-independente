CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Deny access to anon and authenticated
REVOKE ALL ON public.app_config FROM anon;
REVOKE ALL ON public.app_config FROM authenticated;
GRANT ALL ON public.app_config TO service_role;
GRANT ALL ON public.app_config TO postgres;

-- Enable RLS (just in case)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- No policies = nobody except service_role/postgres can read/write

-- Insert the secrets
INSERT INTO public.app_config (key, value, description)
VALUES 
('supabase_url', 'https://thgruqixqfrxfckjlphb.supabase.co', 'URL base do Supabase'),
('service_role_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZ3J1cWl4cWZyeGZja2pscGhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU0NDEyNiwiZXhwIjoyMDk2MTIwMTI2fQ.RXdRc1OUR3zaf9xaWon9nZ-88ikaOuTWKqfnJ3fHusQ', 'Service role key for internal calls')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Update the function to use this table
CREATE OR REPLACE FUNCTION public.handle_new_sale_notification()
RETURNS TRIGGER AS $$
DECLARE
    product_name TEXT;
    product_user_id UUID;
    supabase_url TEXT;
    service_role_key TEXT;
BEGIN
    -- Only notify for approved/paid sales
    IF (NEW.status = 'approved' OR NEW.status = 'paid') THEN
        -- Get product info and owner
        SELECT name, user_id INTO product_name, product_user_id 
        FROM public.products 
        WHERE id = NEW.product_id;

        IF product_user_id IS NOT NULL THEN
            SELECT value INTO supabase_url FROM public.app_config WHERE key = 'supabase_url';
            SELECT value INTO service_role_key FROM public.app_config WHERE key = 'service_role_key';
            
            IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
                PERFORM net.http_post(
                    url := supabase_url || '/functions/v1/send-push',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || service_role_key
                    ),
                    body := jsonb_build_object(
                        'user_id', product_user_id,
                        'title', 'Nova Venda 🎉',
                        'body', 'Pingou! Você recebeu ' || NEW.amount || ' MT no produto ' || COALESCE(product_name, 'Desconhecido')
                    )
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
