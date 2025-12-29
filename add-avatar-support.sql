-- Add avatar support for volunteers
-- This migration adds avatar_url field to store profile pictures

-- Add avatar_url column to volunteers table
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add comment
COMMENT ON COLUMN volunteers.avatar_url IS 'URL to volunteer profile picture stored in Supabase Storage';

-- Create storage bucket for avatars (run this in Supabase Dashboard > Storage)
-- Bucket name: avatars
-- Public: true (so avatars can be displayed)
-- File size limit: 2MB
-- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif

/*
To create the storage bucket, go to Supabase Dashboard > Storage and:
1. Click "New bucket"
2. Name: "avatars"
3. Public: Yes
4. File size limit: 2097152 (2MB)
5. Allowed MIME types: image/jpeg,image/png,image/webp,image/gif

Then create RLS policies:

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to view avatars (public bucket)
CREATE POLICY "Avatars are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
*/

SELECT 'Avatar support added to volunteers table!' AS message;
SELECT 'Remember to create the "avatars" storage bucket in Supabase Dashboard' AS reminder;
