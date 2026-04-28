ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.scholarships.view_count
  IS '장학금 상세 페이지 누적 조회수';
