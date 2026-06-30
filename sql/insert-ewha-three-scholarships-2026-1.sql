-- 2026-1 이화여대 공통 장학금 3종
-- 매핑 메모:
-- - 학비감면 -> 등록금, 학업보조비 -> 학업장려금
-- - apply_start_date 미제공: apply_end_date와 동일일로 임시 설정
-- - 학점등록은 enum 부재: 재학으로 매핑하고 qual_special_info에 원문 조건 보존

-- 1) 2026-1학기 본부기탁 장학금 (학부)
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
  '2026-1학기 본부기탁 장학금 (학부)',
  '이화여자대학교 (학생처 장학복지팀)',
  '대학교',
  ARRAY['등록금', '학업장려금']::support_category[],
  '기탁 장학금 유형별 상이 (등록금형/생활비형 포함 가능)',
  DATE '2026-05-13',
  DATE '2026-05-13',
  NULL,
  NULL,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  2.0,
  ARRAY[
    '장학금별로 평점 3.00 이상 추가 요건이 있을 수 있음',
    '기탁 장학금 종류에 따라 등록금 초과 수혜(생활비 지원) 가능 여부 상이',
    '유레카에서 개별 기탁장학금 세부 요건 확인 필수'
  ]::text[],
  false,
  ARRAY[]::text[],
  '소속 단과대학 행정실 접수',
  '',
  'https://www.ewha.ac.kr/',
  NULL,
  '유형별 지급 성격이 상이하므로 개별 기탁장학금 공지를 반드시 확인하세요.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships s
  WHERE s.organization = '이화여자대학교 (학생처 장학복지팀)'
    AND s.name = '2026-1학기 본부기탁 장학금 (학부)'
);

-- 2) 2026-1학기 선배라면 장학금 (학부)
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
  '2026-1학기 선배라면 장학금 (학부)',
  '이화여자대학교',
  '대학교',
  ARRAY['등록금']::support_category[],
  '학비감면(등록금 범위 내)',
  DATE '2026-05-13',
  DATE '2026-05-13',
  NULL,
  NULL,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  2.0,
  ARRAY[
    '가계곤란자 우선 선발',
    '학점등록생 포함(공고 기준)'
  ]::text[],
  true,
  ARRAY[
    '장학금 신청서',
    '자기소개서',
    '가계곤란 증빙서류(부/모 과세증명서 및 건강보험료 납부확인서)'
  ]::text[],
  '소속 단과대학 행정실 접수',
  '',
  'https://www.ewha.ac.kr/',
  NULL,
  '수혜 시 감사편지 제출이 필수입니다.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships s
  WHERE s.organization = '이화여자대학교'
    AND s.name = '2026-1학기 선배라면 장학금 (학부)'
);

-- 3) 2026-1학기 이화국제재단 장학금 (학부)
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
  '2026-1학기 이화국제재단 장학금 (학부)',
  '이화여자대학교 / 이화국제재단(EIF)',
  '대학교',
  ARRAY['등록금', '학업장려금']::support_category[],
  '지급 시점 환율에 따라 원화 환산 지급(주로 1,000~2,500 USD 선)',
  DATE '2026-05-13',
  DATE '2026-05-13',
  NULL,
  NULL,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  2.0,
  ARRAY[
    '신입생 제외(일부 장학금 예외 가능)',
    '영문에세이(Personal Essay) 제출 필수',
    '일부 장학금은 한글 에세이 가능'
  ]::text[],
  false,
  ARRAY['장학금별 공고 서류(에세이 포함)']::text[],
  '소속 단과대학 행정실 이메일 또는 방문 접수',
  '',
  'https://www.ewha.ac.kr/',
  NULL,
  '세부 요건 및 지급 방식은 각 재단 장학금 공고를 우선 적용합니다.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships s
  WHERE s.organization = '이화여자대학교 / 이화국제재단(EIF)'
    AND s.name = '2026-1학기 이화국제재단 장학금 (학부)'
);
