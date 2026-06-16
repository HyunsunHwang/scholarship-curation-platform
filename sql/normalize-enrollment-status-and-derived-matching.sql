-- 온보딩 재학 상태 단순화에 맞춰 기존 프로필 값을 정규화
UPDATE public.profiles
SET enrollment_status = CASE
  WHEN enrollment_status = '신입생'::public.enrollment_status_type THEN '재학'::public.enrollment_status_type
  WHEN enrollment_status IN (
    '초과이수기'::public.enrollment_status_type,
    '졸업예정'::public.enrollment_status_type,
    '졸업'::public.enrollment_status_type
  ) THEN '수료'::public.enrollment_status_type
  ELSE enrollment_status
END
WHERE enrollment_status IS NOT NULL;

-- 학년 기반 파생 규칙을 포함해 매칭 함수 갱신
CREATE OR REPLACE FUNCTION public.get_matched_scholarships(p_user_id uuid)
 RETURNS SETOF scholarships
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH profile AS (
    SELECT
      p.*,
      u.name   AS resolved_university_name,
      ud.name  AS resolved_department_name,
      ud2.name AS resolved_double_major_name,
      uc.name  AS resolved_college_name,
      uc2.name AS resolved_double_major_college_name
    FROM public.profiles p
    LEFT JOIN public.universities          u   ON u.id   = p.university_id
    LEFT JOIN public.university_departments ud  ON ud.id  = p.department_id
    LEFT JOIN public.university_departments ud2 ON ud2.id = p.double_major_department_id
    LEFT JOIN public.university_colleges    uc  ON uc.id  = p.college_id
    LEFT JOIN public.university_colleges    uc2 ON uc2.id = p.double_major_college_id
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
    AND (
      s.qual_min_academic_year IS NULL
      OR p.enrollment_status IN (
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
      OR (
        p.academic_year IS NOT NULL
        AND (
          p.academic_year > s.qual_min_academic_year
          OR (
            p.academic_year = s.qual_min_academic_year
            AND (
              s.qual_min_academic_semester IS NULL
              OR (p.academic_semester IS NOT NULL AND p.academic_semester >= s.qual_min_academic_semester)
            )
          )
        )
      )
    )
    AND (
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
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(s.qual_special_info) AS req
        WHERE req = ANY(enum_range(NULL::public.special_info_type)::text[])
      )
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
$function$;
