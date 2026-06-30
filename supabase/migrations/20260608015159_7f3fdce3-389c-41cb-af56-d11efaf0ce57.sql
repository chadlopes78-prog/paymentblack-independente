-- Add support_number column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='support_number') THEN
        ALTER TABLE public.products ADD COLUMN support_number TEXT;
    END IF;
END $$;

-- Ensure access_link exists (already seen in check but good to be sure)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='access_link') THEN
        ALTER TABLE public.products ADD COLUMN access_link TEXT;
    END IF;
END $$;

-- Update existing records to have at least something if null (optional but helps stability)
-- UPDATE public.products SET support_number = support_phone WHERE support_number IS NULL AND support_phone IS NOT NULL;
