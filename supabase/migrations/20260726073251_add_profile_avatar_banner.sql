-- 프로필 아바타·배너 이미지 URL
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS banner_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS
  '프로필 사진 공개 URL (storage profile-media). NULL이면 기본 아바타.';
COMMENT ON COLUMN public.profiles.banner_url IS
  '마이페이지 배너 공개 URL (storage profile-media). NULL이면 기본 그라데이션.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-media',
  'profile-media',
  true,
  5242880,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read profile-media" ON storage.objects;
CREATE POLICY "Public read profile-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-media');

DROP POLICY IF EXISTS "Owner upload profile-media" ON storage.objects;
CREATE POLICY "Owner upload profile-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owner update profile-media" ON storage.objects;
CREATE POLICY "Owner update profile-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owner delete profile-media" ON storage.objects;
CREATE POLICY "Owner delete profile-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
