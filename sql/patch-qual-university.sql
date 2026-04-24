-- ──────────────────────────────────────────────────────────────────────────
-- 특정 대학교 / 학과 타겟팅 컬럼 추가 & 매칭 함수 업데이트
-- Supabase SQL Editor 에서 실행하세요
-- ──────────────────────────────────────────────────────────────────────────

-- 1. 신규 컬럼 추가
ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS qual_university text[] NULL;

COMMENT ON COLUMN public.scholarships.qual_university IS
  '특정 대학명 배열. NULL이면 제한 없음. 예: {연세대학교, 고려대학교}';


-- 2. get_matched_scholarships 함수 업데이트
--    qual_university 조건 + qual_major(학과) 조건을 반영합니다.
--    기존 함수를 교체하려면 아래 CREATE OR REPLACE 전체를 실행하세요.
--
--    ⚠️  아래 $$ ... $$ 안의 내용은 현재 운영 중인 함수 본문에 맞게
--        조정이 필요할 수 있습니다.  현재 함수 본문을 먼저 확인하려면:
--        SELECT pg_get_functiondef('get_matched_scholarships'::regproc);

CREATE OR REPLACE FUNCTION public.get_matched_scholarships(p_user_id uuid)
RETURNS SETOF public.scholarships
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH profile AS (
    SELECT * FROM public.profiles WHERE id = p_user_id
  )
  SELECT s.*
  FROM public.scholarships s, profile p
  WHERE s.is_verified = true

    -- 마감 필터 (상시모집 포함)
    AND (
      s.apply_end_date = '9999-12-31'
      OR s.apply_end_date >= to_char(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
    )

    -- ── 특정 대학교 타겟팅 ───────────────────────────────────────────
    AND (
      s.qual_university IS NULL
      OR array_length(s.qual_university, 1) = 0
      OR p.school_name = ANY(s.qual_university)
    )

    -- ── 학교 소재지 (국내/해외) ──────────────────────────────────────
    AND (
      s.qual_school_location IS NULL
      OR array_length(s.qual_school_location, 1) = 0
      OR p.school_location = ANY(s.qual_school_location)
    )

    -- ── 학교 유형 (4년제, 전문대 등) ────────────────────────────────
    AND (
      s.qual_school_category IS NULL
      OR array_length(s.qual_school_category, 1) = 0
      OR p.school_category = ANY(s.qual_school_category)
    )

    -- ── 재학 상태 ────────────────────────────────────────────────────
    AND (
      s.qual_enrollment_status IS NULL
      OR array_length(s.qual_enrollment_status, 1) = 0
      OR p.enrollment_status = ANY(s.qual_enrollment_status)
    )

    -- ── 학년 ─────────────────────────────────────────────────────────
    AND (
      s.qual_academic_year IS NULL
      OR array_length(s.qual_academic_year, 1) = 0
      OR p.academic_year = ANY(s.qual_academic_year)
    )

    -- ── 전공 / 학과 (부분 일치, 대학별 광역 카테고리 포함) ──────────
    AND (
      s.qual_major IS NULL
      OR array_length(s.qual_major, 1) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(s.qual_major) AS m
        WHERE p.department ILIKE '%' || m || '%'
           OR m ILIKE '%' || p.department || '%'
      )
    )

    -- ── 학점 (누적) ──────────────────────────────────────────────────
    AND (
      s.qual_gpa_min IS NULL
      OR p.gpa >= s.qual_gpa_min
    )

    -- ── 학점 (직전 학기) ─────────────────────────────────────────────
    AND (
      s.qual_gpa_last_semester_min IS NULL
      OR p.gpa_last_semester >= s.qual_gpa_last_semester_min
    )

    -- ── 소득 분위 ────────────────────────────────────────────────────
    AND (
      s.qual_income_level_max IS NULL
      OR (
        p.income_level IS NOT NULL
        AND p.income_level <= s.qual_income_level_max
        AND p.income_level >= COALESCE(s.qual_income_level_min, 1)
      )
    )

    -- ── 가구원 수 ────────────────────────────────────────────────────
    AND (
      s.qual_household_size_max IS NULL
      OR (p.household_size IS NOT NULL AND p.household_size <= s.qual_household_size_max)
    )

    -- ── 성별 ─────────────────────────────────────────────────────────
    AND (
      s.qual_gender IS NULL
      OR p.gender = s.qual_gender
    )

    -- ── 나이 ─────────────────────────────────────────────────────────
    AND (
      s.qual_age_min IS NULL
      OR DATE_PART('year', AGE(p.birth_date::date)) >= s.qual_age_min
    )
    AND (
      s.qual_age_max IS NULL
      OR DATE_PART('year', AGE(p.birth_date::date)) <= s.qual_age_max
    )

    -- ── 지역 ─────────────────────────────────────────────────────────
    AND (
      s.qual_region IS NULL
      OR array_length(s.qual_region, 1) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(s.qual_region) AS r
        WHERE p.address ILIKE '%' || r || '%'
      )
    )

    -- ── 국적 ─────────────────────────────────────────────────────────
    AND (
      s.qual_nationality IS NULL
      OR p.nationality = s.qual_nationality
    )

    -- ── 특수 자격 ────────────────────────────────────────────────────
    AND (
      s.qual_special_info IS NULL
      OR array_length(s.qual_special_info, 1) = 0
      OR (p.special_info && s.qual_special_info)
    )

    -- ── 부모 직업 ────────────────────────────────────────────────────
    AND (
      s.qual_parent_occupation IS NULL
      OR array_length(s.qual_parent_occupation, 1) = 0
      OR (p.parent_occupation && s.qual_parent_occupation)
    )

    -- ── 군 복무 상태 ─────────────────────────────────────────────────
    AND (
      s.qual_military_status IS NULL
      OR p.military_status = s.qual_military_status
    )

  ORDER BY s.apply_end_date ASC;
$$;
