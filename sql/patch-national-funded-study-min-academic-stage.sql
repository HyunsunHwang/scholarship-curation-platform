-- 국비유학생 선발시험은 졸업예정자 또는 졸업자 대상입니다.
-- 서비스 매칭에서는 4학년 2학기 이상을 졸업예정 단계로 보고 매칭합니다.

ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS qual_min_academic_year smallint NULL,
  ADD COLUMN IF NOT EXISTS qual_min_academic_semester smallint NULL;

COMMENT ON COLUMN public.scholarships.qual_min_academic_year IS
  '최소 대상 학년. 예: 4학년 2학기 이상이면 4';

COMMENT ON COLUMN public.scholarships.qual_min_academic_semester IS
  '최소 대상 학기. qual_min_academic_year 와 함께 사용. 예: 4학년 2학기 이상이면 2';

ALTER TABLE public.scholarships
  DROP CONSTRAINT IF EXISTS scholarships_qual_min_academic_year_check,
  DROP CONSTRAINT IF EXISTS scholarships_qual_min_academic_semester_check;

ALTER TABLE public.scholarships
  ADD CONSTRAINT scholarships_qual_min_academic_year_check
    CHECK (qual_min_academic_year IS NULL OR qual_min_academic_year BETWEEN 1 AND 5),
  ADD CONSTRAINT scholarships_qual_min_academic_semester_check
    CHECK (qual_min_academic_semester IS NULL OR qual_min_academic_semester BETWEEN 1 AND 2);

UPDATE public.scholarships
SET qual_min_academic_year = 4,
    qual_min_academic_semester = 2
WHERE name IN (
  '2026년도 국비유학생 선발시험 - 일반전형',
  '2026년도 국비유학생 선발시험 - 꿈나래전형'
)
  AND organization = '교육부 국립국제교육원';

-- get_matched_scholarships 조건에 아래 논리를 포함해야 합니다.
-- qual_min_academic_year 가 있으면:
--   1) enrollment_status 가 졸업예정/졸업이거나
--   2) academic_year/academic_semester 가 최소 학년·학기 이상이어야 통과
