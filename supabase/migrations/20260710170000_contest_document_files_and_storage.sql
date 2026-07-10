-- Contest document files (downloaded application forms etc.) + storage bucket.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS document_files jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contests.document_files IS
  'Downloaded contest docs: [{name, url, source_url, mime_type, size}]. url is usually Supabase Storage public URL.';

ALTER TABLE public.crawled_contests
  ADD COLUMN IF NOT EXISTS document_files jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Public bucket for contest posters, body images, and application forms.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contest-files',
  'contest-files',
  true,
  52428800, -- 50MB
  NULL
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- Public read
DROP POLICY IF EXISTS "Public read contest-files" ON storage.objects;
CREATE POLICY "Public read contest-files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contest-files');

-- Admin write
DROP POLICY IF EXISTS "Admin upload contest-files" ON storage.objects;
CREATE POLICY "Admin upload contest-files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contest-files' AND public.is_admin());

DROP POLICY IF EXISTS "Admin update contest-files" ON storage.objects;
CREATE POLICY "Admin update contest-files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'contest-files' AND public.is_admin())
  WITH CHECK (bucket_id = 'contest-files' AND public.is_admin());

DROP POLICY IF EXISTS "Admin delete contest-files" ON storage.objects;
CREATE POLICY "Admin delete contest-files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'contest-files' AND public.is_admin());
