-- Add access_link column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='access_link') THEN
        ALTER TABLE public.products ADD COLUMN access_link TEXT;
    END IF;
END $$;

-- Fix orders table if merchant_id was missing (standardizing column names)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='merchant_id') THEN
        ALTER TABLE public.orders ADD COLUMN merchant_id UUID REFERENCES auth.users(id);
    END IF;
END $$;
