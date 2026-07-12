-- Add content_kind to crawled_contests so review queue can filter by contest/education/activity.

ALTER TABLE public.crawled_contests
  ADD COLUMN IF NOT EXISTS content_kind text NOT NULL DEFAULT 'contest';

UPDATE public.crawled_contests
SET content_kind = 'contest'
WHERE content_kind IS NULL OR content_kind = '';

ALTER TABLE public.crawled_contests
  DROP CONSTRAINT IF EXISTS crawled_contests_content_kind_check;

ALTER TABLE public.crawled_contests
  ADD CONSTRAINT crawled_contests_content_kind_check
  CHECK (content_kind IN ('contest', 'education', 'activity'));

CREATE INDEX IF NOT EXISTS crawled_contests_kind_status_idx
  ON public.crawled_contests (content_kind, status, last_seen_at DESC);

COMMENT ON COLUMN public.crawled_contests.content_kind IS
  'Staging content type: contest | education | activity';
