-- 장학금 교내(on_campus) / 교외(off_campus) 분류 컬럼 추가
-- 기존 행은 일단 교외(off_campus)로 채운 뒤, 아래 백필로 교내를 추론한다.
ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS scholarship_type text NOT NULL DEFAULT 'off_campus';

ALTER TABLE public.scholarships
  DROP CONSTRAINT IF EXISTS scholarships_scholarship_type_check;
ALTER TABLE public.scholarships
  ADD CONSTRAINT scholarships_scholarship_type_check
  CHECK (scholarship_type IN ('on_campus', 'off_campus'));

COMMENT ON COLUMN public.scholarships.scholarship_type
  IS '장학금 분류: on_campus(교내) / off_campus(교외)';

-- 추론 백필: 특정 대학 한정(qual_university)이거나,
-- 장학금명·기관명에 등록된 대학명이 포함되면 교내로 본다.
UPDATE public.scholarships s
SET scholarship_type = 'on_campus'
WHERE s.scholarship_type <> 'on_campus'
  AND (
    (s.qual_university IS NOT NULL AND array_length(s.qual_university, 1) >= 1)
    OR EXISTS (
      SELECT 1
      FROM public.universities u
      WHERE char_length(btrim(u.name)) >= 3
        AND (
          s.name ILIKE '%' || u.name || '%'
          OR s.organization ILIKE '%' || u.name || '%'
        )
    )
  );

-- 탭/필터 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS scholarships_scholarship_type_idx
  ON public.scholarships (scholarship_type);
