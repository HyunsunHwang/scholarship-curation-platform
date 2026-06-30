-- 2026 여름 스크랜튼대학 국내탐방 지원 프로그램
-- 매핑 메모:
-- - support_types 원문 대외활동/학업보조비 -> ENUM `기타` + `학업장려금`
-- - support_amount 범위형(30~40만 원) -> 최대값 400000 저장, 상세는 support_amount_text에 보존
-- - apply_end_date 시간 정보(23:59)는 qual_special_info/note에 보존
-- - apply_start_date 미제공 -> apply_end_date와 동일일 설정

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount,
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
  '2026 여름 스크랜튼대학 국내탐방 지원 프로그램',
  '이화여자대학교 스크랜튼대학',
  '대학교',
  ARRAY['기타', '학업장려금']::support_category[],
  400000,
  '1인당 약 30~40만 원 내외 탐방비 지원',
  DATE '2026-05-28',
  DATE '2026-05-28',
  NULL,
  NULL,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['스크랜튼대학'],
  2.0,
  ARRAY[
    '스크랜튼대학 재학생 전용',
    '정규등록생만 지원 가능(학점등록생, 휴학/자퇴/수료 예정자 불가)',
    '4~5인 팀 단위 지원(개인 지원 불가)',
    '탐방 결과 보고회 필수 참석',
    '접수 마감: 2026-05-28 23:59'
  ]::text[],
  false,
  ARRAY[
    '국내탐방 계획서(지정 양식)',
    '팀원 명단'
  ]::text[],
  '이메일 접수',
  'mailto:scrantoncollege@ewha.ac.kr',
  'https://www.ewha.ac.kr/',
  '02-3277-3654',
  E'선발 후 서약서 및 보험 사본 추가 제출 필요.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '이화여자대학교 스크랜튼대학'
    AND s.name = '2026 여름 스크랜튼대학 국내탐방 지원 프로그램'
);
