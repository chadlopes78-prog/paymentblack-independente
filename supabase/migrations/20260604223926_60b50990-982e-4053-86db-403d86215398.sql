
CREATE POLICY "Public can read product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Users can upload their own product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND auth.uid()::text = (storage.foldername(name))[1]);
