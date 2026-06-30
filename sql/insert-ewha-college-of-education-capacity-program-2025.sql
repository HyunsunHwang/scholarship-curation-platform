-- 2025 이화 사범인 역량 강화 프로그램 — 이화여자대학교 사범대학
-- 매핑 메모:
-- - support_types 원문 대외활동/학업보조비 -> ENUM `기타` + `학업장려금`
-- - apply_start_date 미제공 -> apply_end_date와 동일일로 설정(세부 일정은 공고 확인)

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
  '2025 이화 사범인 역량 강화 프로그램',
  '이화여자대학교 사범대학',
  '대학교',
  ARRAY['기타', '학업장려금']::support_category[],
  '1인당 100만 원 (인턴십 또는 연구 활동 수행 후 지급, 금액 조정 불가)',
  DATE '2025-06-09',
  DATE '2025-06-09',
  NULL,
  61,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['사범대학 전 학과'],
  2.0,
  ARRAY[
    '동일 학년도 내 미래설계, 도전학기 장학금 수혜자 신청 불가(연구역량)',
    '특성화 장학금 내 세부 프로그램 중복 수혜 불가',
    '활동 완료 후 결과보고서 제출 필수',
    '신입생, 휴학, 자퇴, 제적, 수료생 참여 불가',
    '사범대학 전 학과/전공 대상(교육, 유아교육, 초등교육, 교육공학, 특수교육, 영어교육, 사회과교육, 국어교육, 과학교육, 수학교육)'
  ]::text[],
  true,
  ARRAY[
    '교직/취업역량 프로그램 신청서',
    '프로그램 연구계획서'
  ]::text[],
  '오프라인 접수 (학생 본인이 소속 학과 사무실 직접 제출)',
  '',
  'https://www.ewha.ac.kr/',
  NULL,
  E'교직/취업 및 연구 역량 강화 트랙 프로그램.\n'
  || E'사범대 각 학과/전공별 TO 차등 배정.\n'
  || E'등록금 범위 초과 및 중복 수혜 가능.\n'
  || E'지원 트랙에 따라 제출 서류가 상이할 수 있음.',
  1,
  '서류심사 및 활동계획 검토',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '이화여자대학교 사범대학'
    AND s.name = '2025 이화 사범인 역량 강화 프로그램'
);
