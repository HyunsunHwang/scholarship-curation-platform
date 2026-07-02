-- ══════════════════════════════════════════════════════════════════════════
-- org_units Phase 2: ID 기반 장학금 타겟팅 + 매칭 RPC 재작성
--
-- 전제: org-units-phase1-schema-and-backfill.sql 실행 완료
--
-- 내용:
--   ① scholarship_target_units — 교내 장학금의 노드 타겟 (노드 + 하위 전체 매칭)
--   ② scholarships.qual_field_codes — 교외 장학금의 계열 타겟
--   ③ get_matched_scholarships 의 전공/학과 블록 재작성:
--        타겟 유닛이 있으면 org_unit 조상 체인 ID 매칭,
--        계열 코드가 있으면 코드 매칭,
--        둘 다 없으면 기존 qual_major 텍스트 매칭 폴백 (이행기 이중 매칭)
--      ※ 함수 본문은 2026-07-02 운영 DB 배포본 기준
--        (auth 가드, 입학유형 필터, 재학상태 동치 규칙, 단과대명 매칭 포함).
--        전공/학과 블록 외에는 변경 없음.
--
-- 실행: Supabase SQL Editor 에서 전체 실행 (여러 번 실행해도 안전)
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1. 교내 장학금 타겟: scholarship_target_units ──────────────────────────
-- 타겟 노드의 서브트리 전체가 매칭 대상.
-- 예: 공과대학 노드 하나 지정 → 하위 학부·학과 재학생 전부 매칭.

create table if not exists public.scholarship_target_units (
  scholarship_id bigint not null references public.scholarships(id) on delete cascade,
  org_unit_id    bigint not null references public.org_units(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (scholarship_id, org_unit_id)
);

comment on table public.scholarship_target_units is
  '교내 장학금의 org_unit 타겟. 노드 + 하위 전체 매칭. 행이 없으면 기존 qual_major 텍스트 매칭 폴백.';

create index if not exists idx_scholarship_target_units_org_unit
  on public.scholarship_target_units (org_unit_id);

alter table public.scholarship_target_units enable row level security;

drop policy if exists "scholarship_target_units_select_public" on public.scholarship_target_units;
create policy "scholarship_target_units_select_public"
  on public.scholarship_target_units for select using (true);

drop policy if exists "scholarship_target_units_admin_insert" on public.scholarship_target_units;
create policy "scholarship_target_units_admin_insert"
  on public.scholarship_target_units for insert with check (public.is_admin());

drop policy if exists "scholarship_target_units_admin_update" on public.scholarship_target_units;
create policy "scholarship_target_units_admin_update"
  on public.scholarship_target_units for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "scholarship_target_units_admin_delete" on public.scholarship_target_units;
create policy "scholarship_target_units_admin_delete"
  on public.scholarship_target_units for delete using (public.is_admin());


-- ── 2. 교외 장학금 타겟: 계열 코드 ─────────────────────────────────────────
-- 재단 장학금의 "이공계", "공학계열"은 특정 대학 노드가 아니라 분야 개념.
-- org_units.field_code (Phase 1에서 컬럼 생성) 를 학과 노드에 부여하고,
-- 장학금은 계열 코드 배열로 타겟한다.
-- 권장 코드: 인문 / 사회 / 교육 / 공학 / 자연 / 의약 / 예체능 (표준 7대 계열)

alter table public.scholarships
  add column if not exists qual_field_codes text[] null;

comment on column public.scholarships.qual_field_codes is
  '교외 장학금 계열 타겟 (예: {공학,자연}). NULL/빈 배열이면 제한 없음. org_units.field_code와 매칭.';

create index if not exists idx_scholarships_qual_field_codes
  on public.scholarships using gin (qual_field_codes);


-- ── 3. get_matched_scholarships 재작성 ─────────────────────────────────────
--
-- 전공/학과 매칭 우선순위:
--   ① scholarship_target_units 행 존재 → org_unit 조상 체인 ID 매칭
--      · 타겟이 내 조상(또는 자기 자신)이면 매칭  (공대 타겟 → 공대 소속 학과생 OK)
--      · 내가 타겟의 조상이면 매칭 (완화 규칙)     (학과 미정 1학년 → 단과대 하위 학과 타겟도 노출)
--      · 복수전공 노드도 동일 규칙 적용
--      · org_unit 미배정 유저는 qual_major 텍스트로 폴백 (이행기 안전장치)
--   ② qual_field_codes 존재 → 계열 코드 매칭
--      · 내 노드에서 가장 가까운(깊은) field_code 조상 기준
--   ③ 둘 다 없으면 → 기존 qual_major 텍스트 매칭 (이행기 폴백, 백필 완료 후 제거 예정)
--
-- 전공/학과 블록 외 나머지 조건은 운영 배포본과 동일.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_matched_scholarships(p_user_id uuid)
RETURNS SETOF public.scholarships
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH profile AS (
    SELECT
      p.*,
      u.name   AS resolved_university_name,
      ud.name  AS resolved_department_name,
      ud2.name AS resolved_double_major_name,
      uc.name  AS resolved_college_name,
      uc2.name AS resolved_double_major_college_name,
      -- org_unit 트리 정보 (Phase 1 백필)
      ou.path_ids  AS own_path_ids,
      dmu.path_ids AS dm_path_ids,
      -- 내 노드에서 가장 가까운(깊은) 조상의 계열 코드
      (SELECT f.field_code FROM public.org_units f
       WHERE f.id = ANY(ou.path_ids) AND f.field_code IS NOT NULL
       ORDER BY cardinality(f.path_ids) DESC LIMIT 1) AS own_field_code,
      (SELECT f.field_code FROM public.org_units f
       WHERE f.id = ANY(dmu.path_ids) AND f.field_code IS NOT NULL
       ORDER BY cardinality(f.path_ids) DESC LIMIT 1) AS dm_field_code
    FROM public.profiles p
    LEFT JOIN public.universities          u   ON u.id   = p.university_id
    LEFT JOIN public.university_departments ud  ON ud.id  = p.department_id
    LEFT JOIN public.university_departments ud2 ON ud2.id = p.double_major_department_id
    LEFT JOIN public.university_colleges    uc  ON uc.id  = p.college_id
    LEFT JOIN public.university_colleges    uc2 ON uc2.id = p.double_major_college_id
    LEFT JOIN public.org_units ou  ON ou.id = p.org_unit_id
    LEFT JOIN public.org_units dmu ON dmu.id = p.double_major_org_unit_id
    WHERE p.id = p_user_id
  )
  SELECT s.*
  FROM public.scholarships s
  CROSS JOIN profile p
  WHERE (auth.uid() = p_user_id OR public.is_admin())
    AND s.is_verified = true
    AND (
      s.apply_end_date = '9999-12-31'
      OR s.apply_end_date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date
    )
    AND (
      s.qual_university IS NULL
      OR cardinality(s.qual_university) = 0
      OR (p.resolved_university_name IS NOT NULL AND p.resolved_university_name = ANY(s.qual_university))
      OR (p.school_name IS NOT NULL AND p.school_name = ANY(s.qual_university))
    )
    AND (
      s.qual_school_location IS NULL
      OR cardinality(s.qual_school_location) = 0
      OR p.school_location = ANY(s.qual_school_location)
    )
    AND (
      s.qual_school_category IS NULL
      OR cardinality(s.qual_school_category) = 0
      OR p.school_category = ANY(s.qual_school_category)
    )
    AND (
      s.qual_admission_type IS NULL
      OR cardinality(s.qual_admission_type) = 0
      OR (p.admission_type IS NOT NULL AND p.admission_type = ANY(s.qual_admission_type))
    )
    AND (
      s.qual_enrollment_status IS NULL
      OR cardinality(s.qual_enrollment_status) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.qual_enrollment_status) AS req
        WHERE
          req = p.enrollment_status
          OR (
            req = '재학'::public.enrollment_status_type
            AND p.enrollment_status = '신입생'::public.enrollment_status_type
          )
          OR (
            req = '신입생'::public.enrollment_status_type
            AND p.enrollment_status = '재학'::public.enrollment_status_type
            AND p.academic_year = 1
          )
          OR (
            req = '졸업예정'::public.enrollment_status_type
            AND (
              p.enrollment_status IN (
                '수료'::public.enrollment_status_type,
                '초과이수기'::public.enrollment_status_type,
                '졸업예정'::public.enrollment_status_type,
                '졸업'::public.enrollment_status_type
              )
              OR (
                p.enrollment_status = '재학'::public.enrollment_status_type
                AND p.academic_year IS NOT NULL
                AND p.academic_year >= 4
              )
            )
          )
      )
    )
    AND (
      s.qual_academic_year IS NULL
      OR cardinality(s.qual_academic_year) = 0
      OR p.academic_year = ANY(s.qual_academic_year)
    )

    -- ── 전공 / 학과 (org_unit ID 매칭 → 계열 코드 → 텍스트 폴백) ────────
    AND (
      CASE
        -- ① 교내: org_unit 타겟이 지정된 장학금
        WHEN EXISTS (
          SELECT 1 FROM public.scholarship_target_units t0
          WHERE t0.scholarship_id = s.id
        ) THEN (
          EXISTS (
            SELECT 1
            FROM public.scholarship_target_units t
            JOIN public.org_units tu ON tu.id = t.org_unit_id
            WHERE t.scholarship_id = s.id
              AND (
                -- 타겟이 내 조상 또는 자기 자신 (본전공)
                (p.own_path_ids IS NOT NULL AND t.org_unit_id = ANY(p.own_path_ids))
                -- 완화 규칙: 내가 타겟의 조상 (학과 미정 → 하위 학과 타겟 노출)
                OR (p.org_unit_id IS NOT NULL AND p.org_unit_id = ANY(tu.path_ids))
                -- 복수전공 동일 규칙
                OR (p.dm_path_ids IS NOT NULL AND t.org_unit_id = ANY(p.dm_path_ids))
                OR (p.double_major_org_unit_id IS NOT NULL
                    AND p.double_major_org_unit_id = ANY(tu.path_ids))
              )
          )
          -- 이행기 안전장치: org_unit 미배정 유저(자유 텍스트 학과만 있는 프로필)는
          -- qual_major 가 채워져 있는 경우에 한해 텍스트 매칭으로 폴백
          OR (
            p.org_unit_id IS NULL AND p.double_major_org_unit_id IS NULL
            AND s.qual_major IS NOT NULL AND cardinality(s.qual_major) > 0
            AND EXISTS (
              SELECT 1 FROM unnest(s.qual_major) AS m
              WHERE
                (p.department IS NOT NULL AND (
                  p.department ILIKE '%' || m || '%'
                  OR m ILIKE '%' || p.department || '%'
                ))
                OR (p.double_major_department IS NOT NULL AND (
                  p.double_major_department ILIKE '%' || m || '%'
                  OR m ILIKE '%' || p.double_major_department || '%'
                ))
            )
          )
        )

        -- ② 교외: 계열 코드 타겟
        WHEN s.qual_field_codes IS NOT NULL AND cardinality(s.qual_field_codes) > 0
        THEN (
          (p.own_field_code IS NOT NULL AND p.own_field_code = ANY(s.qual_field_codes))
          OR (p.dm_field_code IS NOT NULL AND p.dm_field_code = ANY(s.qual_field_codes))
        )

        -- ③ 폴백: 기존 qual_major 텍스트 매칭 (운영 배포본과 동일, 이행기 한시 유지)
        ELSE (
          s.qual_major IS NULL
          OR cardinality(s.qual_major) = 0
          OR EXISTS (
            SELECT 1 FROM unnest(s.qual_major) AS m
            WHERE
              (p.resolved_department_name IS NOT NULL AND (
                p.resolved_department_name ILIKE '%' || m || '%'
                OR m ILIKE '%' || p.resolved_department_name || '%'
              ))
              OR (p.department IS NOT NULL AND (
                p.department ILIKE '%' || m || '%'
                OR m ILIKE '%' || p.department || '%'
              ))
              OR (p.resolved_college_name IS NOT NULL AND (
                p.resolved_college_name ILIKE '%' || m || '%'
                OR m ILIKE '%' || p.resolved_college_name || '%'
              ))
              OR (p.resolved_double_major_name IS NOT NULL AND (
                p.resolved_double_major_name ILIKE '%' || m || '%'
                OR m ILIKE '%' || p.resolved_double_major_name || '%'
              ))
              OR (p.double_major_department IS NOT NULL AND (
                p.double_major_department ILIKE '%' || m || '%'
                OR m ILIKE '%' || p.double_major_department || '%'
              ))
              OR (p.resolved_double_major_college_name IS NOT NULL AND (
                p.resolved_double_major_college_name ILIKE '%' || m || '%'
                OR m ILIKE '%' || p.resolved_double_major_college_name || '%'
              ))
          )
        )
      END
    )

    AND (
      s.qual_gpa_min IS NULL
      OR (p.gpa IS NOT NULL AND p.gpa >= s.qual_gpa_min)
    )
    AND (
      s.qual_gpa_last_semester_min IS NULL
      OR (p.gpa_last_semester IS NOT NULL AND p.gpa_last_semester >= s.qual_gpa_last_semester_min)
    )
    AND (
      s.qual_income_level_max IS NULL
      OR (
        p.income_level IS NOT NULL
        AND p.income_level <= s.qual_income_level_max
        AND p.income_level >= COALESCE(s.qual_income_level_min, 1)
      )
    )
    AND (
      s.qual_household_size_max IS NULL
      OR (p.household_size IS NOT NULL AND p.household_size <= s.qual_household_size_max)
    )
    AND (
      s.qual_gender IS NULL
      OR p.gender = s.qual_gender
    )
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
    AND (
      s.qual_region IS NULL
      OR cardinality(s.qual_region) = 0
      OR (p.address IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(s.qual_region) AS r
        WHERE p.address ILIKE '%' || r || '%'
      ))
    )
    AND (
      s.qual_nationality IS NULL
      OR p.nationality = s.qual_nationality
    )
    AND (
      s.qual_special_info IS NULL
      OR cardinality(s.qual_special_info) = 0
      OR (
        p.special_info IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM unnest(s.qual_special_info) AS req
          WHERE req = ANY(p.special_info::text[])
        )
      )
    )
    AND (
      s.qual_parent_occupation IS NULL
      OR cardinality(s.qual_parent_occupation) = 0
      OR (p.parent_occupation IS NOT NULL AND p.parent_occupation && s.qual_parent_occupation)
    )
    AND (
      s.qual_military_status IS NULL
      OR p.military_status = s.qual_military_status
    )
  ORDER BY s.apply_end_date ASC;
$$;

REVOKE ALL ON FUNCTION public.get_matched_scholarships(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_matched_scholarships(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_matched_scholarships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_matched_scholarships(uuid) TO service_role;


-- ── 4. 완료 확인 ──────────────────────────────────────────────────────────

SELECT
  'get_matched_scholarships' AS func,
  pg_get_function_arguments('get_matched_scholarships'::regproc) AS args,
  'org_unit 매칭 적용' AS status;
