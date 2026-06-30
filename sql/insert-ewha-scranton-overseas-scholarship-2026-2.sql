-- 2026-2학기 해외연수 장학금 (스크랜튼학부)
-- 매핑 메모:
-- - support_types 원문 학업보조비/해외연수 -> ENUM `학업장려금` + `해외연수비`
-- - support_amount 미제공 -> 0 처리, 상세는 support_amount_text에 보존

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
  '2026-2학기 해외연수 장학금 (스크랜튼학부)',
  '이화여자대학교 스크랜튼학부',
  '대학교',
  ARRAY['학업장려금', '해외연수비']::support_category[],
  0,
  '등록금 범위 초과 지급 가능(공고 기준, 개인별 지급액 상이)',
  DATE '2026-04-10',
  DATE '2026-06-22',
  NULL,
  NULL,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['스크랜튼학부'],
  ARRAY[
    '2026-2학기 교환학생 파견 확정자',
    '입학 시 H1 또는 H4 스크랜튼학부 장학금 수혜자',
    '스크랜튼학부 해외연수장학금 기수혜자(1회) 지원 불가',
    '3학기 이후(2학년 1학기부터) 신청 가능',
    '자유전공 입학생만 가능(진입생 신청 불가)'
  ]::text[],
  true,
  ARRAY[
    '해외연수장학금 신청서',
    '성적표 (스크랜튼학부 개설 교과목 이수 확인용)'
  ]::text[],
  '오프라인 접수 (스크랜튼학부 행정실 직접 방문 제출)',
  '',
  'https://www.ewha.ac.kr/',
  '02-3277-6592 / ewhascranton@ewha.ac.kr',
  E'마감 엄수.\n'
  || E'성적표 일부 가림 제출 가능, 당해 학기 수강 과목은 수기 작성.\n'
  || E'확정 결과는 개별 통보되지 않으며, 지급 완료 후(10월 말 예상) 유레카에서 확인 가능.\n'
  || E'사물함 사용자는 파견 전 반납 필수.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '이화여자대학교 스크랜튼학부'
    AND s.name = '2026-2학기 해외연수 장학금 (스크랜튼학부)'
);
