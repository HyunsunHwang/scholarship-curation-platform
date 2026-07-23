-- 경험 결과물(링크·파일) 첨부
ALTER TABLE public.profile_spec_items
  ADD COLUMN IF NOT EXISTS artifacts jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profile_spec_items.artifacts IS
  '결과물 첨부 [{id, kind:link|file, ...}]. 파일은 프로필당 최대 5개(앱·서버에서 강제).';

ALTER TABLE public.profile_spec_items
  DROP CONSTRAINT IF EXISTS profile_spec_items_artifacts_is_array;

ALTER TABLE public.profile_spec_items
  ADD CONSTRAINT profile_spec_items_artifacts_is_array
  CHECK (jsonb_typeof(artifacts) = 'array');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-artifacts',
  'profile-artifacts',
  true,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read profile-artifacts" ON storage.objects;
CREATE POLICY "Public read profile-artifacts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-artifacts');

DROP POLICY IF EXISTS "Owner upload profile-artifacts" ON storage.objects;
CREATE POLICY "Owner upload profile-artifacts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-artifacts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owner update profile-artifacts" ON storage.objects;
CREATE POLICY "Owner update profile-artifacts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-artifacts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-artifacts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owner delete profile-artifacts" ON storage.objects;
CREATE POLICY "Owner delete profile-artifacts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-artifacts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
