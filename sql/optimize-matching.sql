-- ══════════════════════════════════════════════════════════════════════════
-- 장학금 매칭 최적화 마이그레이션
-- Supabase SQL Editor 에서 전체 실행
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. 누락 컬럼 추가 ──────────────────────────────────────────────────────

ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS qual_university text[] NULL;

COMMENT ON COLUMN public.scholarships.qual_university IS
  '특정 대학교명 배열. NULL 또는 빈 배열이면 모든 학교 대상. 예: {연세대학교, 고려대학교}';


-- ── 2. 성능 인덱스 ────────────────────────────────────────────────────────
--   · 주 필터 (is_verified + apply_end_date)
--   · 배열 컬럼 → GIN 인덱스 (&&, = ANY 연산 최적화)
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_scholarships_verified_deadline
  ON public.scholarships (is_verified, apply_end_date);

CREATE INDEX IF NOT EXISTS idx_scholarships_list_on_home
  ON public.scholarships (list_on_home) WHERE is_verified = true;

-- 배열 컬럼 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_scholarships_qual_university
  ON public.scholarships USING GIN (qual_university);

CREATE INDEX IF NOT EXISTS idx_scholarships_qual_school_location
  ON public.scholarships USING GIN (qual_school_location);

CREATE INDEX IF NOT EXISTS idx_scholarships_qual_school_category
  ON public.scholarships USING GIN (qual_school_category);

CREATE INDEX IF NOT EXISTS idx_scholarships_qual_enrollment_status
  ON public.scholarships USING GIN (qual_enrollment_status);

CREATE INDEX IF NOT EXISTS idx_scholarships_qual_academic_year
  ON public.scholarships USING GIN (qual_academic_year);

CREATE INDEX IF NOT EXISTS idx_scholarships_qual_major
  ON public.scholarships USING GIN (qual_major);

CREATE INDEX IF NOT EXISTS idx_scholarships_qual_region
  ON public.scholarships USING GIN (qual_region);

CREATE INDEX IF NOT EXISTS idx_scholarships_qual_special_info
  ON public.scholarships USING GIN (qual_special_info);

CREATE INDEX IF NOT EXISTS idx_scholarships_qual_parent_occupation
  ON public.scholarships USING GIN (qual_parent_occupation);

-- 프로필 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_university_id
  ON public.profiles (university_id);

CREATE INDEX IF NOT EXISTS idx_profiles_department_id
  ON public.profiles (department_id);


-- ── 3. get_matched_scholarships 함수 전면 재작성 ──────────────────────────
--
--  수정 사항:
--  ① array_length() → cardinality() 로 교체
--     (array_length('{}'::text[], 1) = NULL → cardinality('{}') = 0 로 정확하게 처리)
--  ② 대학교 매칭: school_name 텍스트 비교 + university_id → universities 테이블 조인
--  ③ 복수전공(double_major_department) 학과 매칭 포함
--  ④ birth_date NULL 안전 처리 (나이 계산 시 NULL guard)
--  ⑤ 학점 NULL 안전 처리 (gpa/gpa_last_semester NULL이면 해당 조건 건너뜀)
--  ⑥ 모든 배열 조건 cardinality() 기준으로 통일
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_matched_scholarships(p_user_id uuid)
RETURNS SETOF public.scholarships
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH profile AS (
    SELECT
      p.*,
      -- universities 테이블에서 정규화된 대학교명 가져오기 (university_id 기준)
      u.name AS resolved_university_name,
      -- university_departments 테이블에서 정규화된 학과명 (department_id 기준)
      ud.name AS resolved_department_name,
      -- 복수전공 학과명 (double_major_department_id 기준)
      ud2.name AS resolved_double_major_name
    FROM public.profiles p
    LEFT JOIN public.universities u
      ON u.id = p.university_id
    LEFT JOIN public.university_departments ud
      ON ud.id = p.department_id
    LEFT JOIN public.university_departments ud2
      ON ud2.id = p.double_major_department_id
    WHERE p.id = p_user_id
  )
  SELECT s.*
  FROM public.scholarships s, profile p
  WHERE s.is_verified = true

    -- ── 마감 필터 (상시모집 '9999-12-31' 포함) ─────────────────────────
    AND (
      s.apply_end_date = '9999-12-31'
      OR s.apply_end_date >= to_char(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
    )

    -- ── 특정 대학교 타겟팅 ──────────────────────────────────────────────
    -- qual_university 가 비어있으면 제한 없음
    -- 매칭 우선순위: ① university_id 기반 정규화명 ② school_name 텍스트
    AND (
      cardinality(s.qual_university) = 0
      OR s.qual_university IS NULL
      OR (p.resolved_university_name IS NOT NULL AND p.resolved_university_name = ANY(s.qual_university))
      OR (p.school_name IS NOT NULL AND p.school_name = ANY(s.qual_university))
    )

    -- ── 학교 소재지 (국내 대학 / 해외 대학) ────────────────────────────
    AND (
      s.qual_school_location IS NULL
      OR cardinality(s.qual_school_location) = 0
      OR p.school_location = ANY(s.qual_school_location)
    )

    -- ── 학교 유형 (4년제, 전문대, 대학원 등) ───────────────────────────
    AND (
      s.qual_school_category IS NULL
      OR cardinality(s.qual_school_category) = 0
      OR p.school_category = ANY(s.qual_school_category)
    )

    -- ── 재학 상태 ───────────────────────────────────────────────────────
    AND (
      s.qual_enrollment_status IS NULL
      OR cardinality(s.qual_enrollment_status) = 0
      OR p.enrollment_status = ANY(s.qual_enrollment_status)
    )

    -- ── 학년 ────────────────────────────────────────────────────────────
    AND (
      s.qual_academic_year IS NULL
      OR cardinality(s.qual_academic_year) = 0
      OR p.academic_year = ANY(s.qual_academic_year)
    )

    -- ── 전공 / 학과 ─────────────────────────────────────────────────────
    -- 우선순위: ① department_id 기반 정규화명 ② department 텍스트 ③ 복수전공
    -- 부분 일치: "컴퓨터공학과" ⊃ "컴퓨터공학" 양방향 검색
    AND (
      s.qual_major IS NULL
      OR cardinality(s.qual_major) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(s.qual_major) AS m
        WHERE
          -- 정규화된 학과명 비교
          (p.resolved_department_name IS NOT NULL AND (
            p.resolved_department_name ILIKE '%' || m || '%'
            OR m ILIKE '%' || p.resolved_department_name || '%'
          ))
          -- 텍스트 학과명 비교
          OR (p.department IS NOT NULL AND (
            p.department ILIKE '%' || m || '%'
            OR m ILIKE '%' || p.department || '%'
          ))
          -- 복수전공 비교 (정규화)
          OR (p.resolved_double_major_name IS NOT NULL AND (
            p.resolved_double_major_name ILIKE '%' || m || '%'
            OR m ILIKE '%' || p.resolved_double_major_name || '%'
          ))
          -- 복수전공 텍스트 비교
          OR (p.double_major_department IS NOT NULL AND (
            p.double_major_department ILIKE '%' || m || '%'
            OR m ILIKE '%' || p.double_major_department || '%'
          ))
      )
    )

    -- ── 누적 학점 ────────────────────────────────────────────────────────
    -- gpa 가 NULL이면 학점 조건이 있는 장학금은 매칭 안 됨 (올바른 동작)
    AND (
      s.qual_gpa_min IS NULL
      OR (p.gpa IS NOT NULL AND p.gpa >= s.qual_gpa_min)
    )

    -- ── 직전 학기 학점 ───────────────────────────────────────────────────
    AND (
      s.qual_gpa_last_semester_min IS NULL
      OR (p.gpa_last_semester IS NOT NULL AND p.gpa_last_semester >= s.qual_gpa_last_semester_min)
    )

    -- ── 소득 분위 ────────────────────────────────────────────────────────
    -- income_level 이 NULL이면 소득 조건이 있는 장학금은 매칭 안 됨
    AND (
      s.qual_income_level_max IS NULL
      OR (
        p.income_level IS NOT NULL
        AND p.income_level <= s.qual_income_level_max
        AND p.income_level >= COALESCE(s.qual_income_level_min, 1)
      )
    )

    -- ── 가구원 수 ────────────────────────────────────────────────────────
    AND (
      s.qual_household_size_max IS NULL
      OR (p.household_size IS NOT NULL AND p.household_size <= s.qual_household_size_max)
    )

    -- ── 성별 ─────────────────────────────────────────────────────────────
    AND (
      s.qual_gender IS NULL
      OR p.gender = s.qual_gender
    )

    -- ── 나이 (birth_date NULL 안전 처리) ────────────────────────────────
    AND (
      s.qual_age_min IS NULL
      OR (p.birth_date IS NOT NULL
          AND DATE_PART('year', AGE((p.birth_date)::date)) >= s.qual_age_min)
    )
    AND (
      s.qual_age_max IS NULL
      OR (p.birth_date IS NOT NULL
          AND DATE_PART('year', AGE((p.birth_date)::date)) <= s.qual_age_max)
    )

    -- ── 지역 (주소 부분 일치) ────────────────────────────────────────────
    AND (
      s.qual_region IS NULL
      OR cardinality(s.qual_region) = 0
      OR (p.address IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(s.qual_region) AS r
        WHERE p.address ILIKE '%' || r || '%'
      ))
    )

    -- ── 국적 ─────────────────────────────────────────────────────────────
    AND (
      s.qual_nationality IS NULL
      OR p.nationality = s.qual_nationality
    )

    -- ── 특수 자격 (배열 교집합) ──────────────────────────────────────────
    AND (
      s.qual_special_info IS NULL
      OR cardinality(s.qual_special_info) = 0
      OR (p.special_info IS NOT NULL AND p.special_info && s.qual_special_info)
    )

    -- ── 부모 직업 (배열 교집합) ──────────────────────────────────────────
    AND (
      s.qual_parent_occupation IS NULL
      OR cardinality(s.qual_parent_occupation) = 0
      OR (p.parent_occupation IS NOT NULL AND p.parent_occupation && s.qual_parent_occupation)
    )

    -- ── 군 복무 상태 ─────────────────────────────────────────────────────
    AND (
      s.qual_military_status IS NULL
      OR p.military_status = s.qual_military_status
    )

  ORDER BY s.apply_end_date ASC;
$$;

-- 함수 소유자 / 권한 유지
REVOKE ALL ON FUNCTION public.get_matched_scholarships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_matched_scholarships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_matched_scholarships(uuid) TO service_role;

-- ── 4. 완료 확인 ──────────────────────────────────────────────────────────

SELECT
  'get_matched_scholarships' AS func,
  pg_get_function_arguments('get_matched_scholarships'::regproc) AS args,
  'updated' AS status;
