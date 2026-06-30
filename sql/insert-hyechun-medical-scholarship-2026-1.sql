-- 2026-1학기 혜춘장학회 장학생(의과대학)
-- 매핑 메모:
-- - institution_type 원문 "사설재단/대학교"는 단일 enum 필요 -> 주관 재단 기준 `재단법인`
-- - support_types 원문 학업보조비 -> ENUM `학업장려금`
-- - 백분위 80점 기준은 학점 스케일과 상이 -> qual_gpa_* 미사용, qual_special_info에 보존
-- - apply_end_date 시간 정보(23:59)와 수여식 일정(6/5)은 note/qual_special_info에 보존

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
  '2026-1학기 혜춘장학회 장학생 (의과대학)',
  '재단법인 혜춘장학회 / 이화여자대학교 의과대학',
  '재단법인',
  ARRAY['학업장려금']::support_category[],
  '1인당 450만 원 (수여식 당일 직접 지급, 생활비 지원 성격)',
  DATE '2026-05-10',
  DATE '2026-05-10',
  NULL,
  1,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['의과대학'],
  ARRAY[
    '학업성적 평균 백분위 80점 이상',
    '가정형편 곤란자',
    '증서수여식(6/5) 필수 참석 가능자'
  ]::text[],
  true,
  ARRAY[
    '재학증명서',
    '성적증명서(백분위)',
    '주민등록등본(주민번호 표기)',
    '가족관계증명서',
    '건강보험자격 및 납부확인서(부,모)'
  ]::text[],
  '이메일 접수',
  'mailto:bbora@ewha.ac.kr',
  'https://www.ewha.ac.kr/',
  '02-6986-6007',
  E'접수 마감: 2026-05-10 23:59.\n'
  || E'모든 서류를 순서대로 합쳐 하나의 PDF로 제출.\n'
  || E'타 장학금 중복 및 등록금 초과 수혜 가능.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '재단법인 혜춘장학회 / 이화여자대학교 의과대학'
    AND s.name = '2026-1학기 혜춘장학회 장학생 (의과대학)'
);
