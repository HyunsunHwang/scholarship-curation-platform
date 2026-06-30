-- 2026 하계 SKKU PharmXplore Scholars
-- 매핑 메모:
-- - support_types 원문 인턴십/대외활동/학업보조비 -> ENUM `기타` + `학업장려금`
-- - apply_end_date 시간 정보(23:59)는 qual_special_info에 보존 (DB는 DATE)
-- - 직전학기 12학점 이상 요건은 qual_special_info에 보존, GPA 2.0은 필드 반영
-- - qual_major "전공 무관"은 실제 지원대상(약학/타학과 학년 구분)이 있어 필터값을 과도하게 고정하지 않도록 NULL 처리

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  announcement_date,
  selection_count,
  qual_university,
  qual_school_location,
  qual_school_category,
  qual_enrollment_status,
  qual_major,
  qual_gpa_last_semester_min,
  qual_special_info,
  can_overlap,
  required_documents,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  selection_stages,
  selection_stage_1,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026 하계 SKKU PharmXplore Scholars',
  '성균관대학교 약학대학',
  '대학교',
  ARRAY['기타', '학업장려금']::support_category[],
  '총 80만 원 (2026-2학기 장학금으로 9월경 지급)',
  DATE '2026-05-04',
  DATE '2026-05-15',
  NULL,
  20,
  ARRAY['성균관대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학', '휴학']::enrollment_status_type[],
  NULL,
  2.0,
  ARRAY[
    '약학과 1~3학년 / 타 학과 1~4학년 지원 가능(전공 무관)',
    '2026-2학기 등록 예정자 필수',
    '직전학기 12학점 이상 및 평점평균 2.0 이상',
    '사전 온라인 안전교육 이수 필수',
    '동일 기간 약학연구 참여 약대생 불가',
    '대학원생 지원 불가',
    '접수 마감: 2026-05-15 23:59',
    '10개 연구실별 최대 2명 선발'
  ]::text[],
  true,
  ARRAY[
    '신청서(서명 필수)',
    '성적증명서',
    '공인영어성적(선택)'
  ]::text[],
  '이메일 접수',
  'mailto:pharmskku@skku.edu',
  'https://www.skku.edu/',
  '031-290-7720(장학), 031-290-5874(실습)',
  E'공인영어성적은 만료된 서류도 제출 가능.\n'
  || E'메일/파일명 양식 엄수.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '성균관대학교 약학대학'
    AND s.name = '2026 하계 SKKU PharmXplore Scholars'
);
