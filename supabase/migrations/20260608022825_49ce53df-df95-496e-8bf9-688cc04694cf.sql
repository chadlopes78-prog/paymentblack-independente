-- Add unique constraint to push_subscriptions
ALTER TABLE public.push_subscriptions 
ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);

-- Ensure RLS is enabled and set up correctly if not already
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage their own subscriptions
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'push_subscriptions' 
        AND policyname = 'Users can manage their own push subscriptions'
    ) THEN
        CREATE POLICY "Users can manage their own push subscriptions" 
        ON public.push_subscriptions 
        FOR ALL 
        USING (auth.uid() = user_id) 
        WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Grant permissions
GRANT ALL ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
