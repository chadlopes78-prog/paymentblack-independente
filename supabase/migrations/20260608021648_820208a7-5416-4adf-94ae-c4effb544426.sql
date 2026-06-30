CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to handle sale notifications
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
            -- In Supabase Edge Functions, we can trigger via HTTP
            -- We need the URL and Key. Since we can't easily get them inside Postgres without a settings table,
            -- we can use placeholders or assume the standard Supabase structure if we have a way to get them.
            -- Alternatively, we can use the 'supabase_functions' schema if it exists.
            
            PERFORM net.http_post(
                url := 'https://' || (SELECT split_part(current_setting('request.header.host', true), '.', 1)) || '.supabase.co/functions/v1/send-push',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
                ),
                body := jsonb_build_object(
                    'user_id', product_user_id,
                    'title', 'Nova Venda 🎉',
                    'body', 'Pingou! Você recebeu ' || NEW.amount || ' MT no produto ' || COALESCE(product_name, 'Desconhecido')
                )
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new sales
DROP TRIGGER IF EXISTS on_new_sale_push ON public.sales;
CREATE TRIGGER on_new_sale_push
AFTER INSERT OR UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_sale_notification();
