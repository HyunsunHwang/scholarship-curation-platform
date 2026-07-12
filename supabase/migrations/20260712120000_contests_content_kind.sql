-- Add content_kind so contests table can also hold education / activity listings.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS content_kind text NOT NULL DEFAULT 'contest';

UPDATE public.contests
SET content_kind = 'contest'
WHERE content_kind IS NULL OR content_kind = '';

ALTER TABLE public.contests
  DROP CONSTRAINT IF EXISTS contests_content_kind_check;

ALTER TABLE public.contests
  ADD CONSTRAINT contests_content_kind_check
  CHECK (content_kind IN ('contest', 'education', 'activity'));

CREATE INDEX IF NOT EXISTS contests_content_kind_list_idx
  ON public.contests (content_kind, list_on_home, is_verified, apply_end_date DESC);

COMMENT ON COLUMN public.contests.content_kind IS
  'Career GPS content type: contest | education | activity';

COMMENT ON TABLE public.contests IS
  'Career GPS opportunities (contest/education/activity). No qual_* matching fields; uses interest_categories.';
