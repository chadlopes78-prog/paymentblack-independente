-- RLS policies for storage.objects in product-deliverables bucket

-- 1. Allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload deliverables"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-deliverables' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Allow users to see/manage their own files
CREATE POLICY "Users can manage their own deliverables"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'product-deliverables' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'product-deliverables' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Allow public access to view files (required for downloads, but ideally we'd use signed URLs. For now keeping it simple or public if needed)
-- Actually, the user wants "download automatically". If it's private, we need signed URLs.
-- For now, let's allow service_role and authenticated.
CREATE POLICY "Service role can access all deliverables"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'product-deliverables');
