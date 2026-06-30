-- 2026-1학기 인권센터 대동제 근로장학생 모집 — 이화여자대학교 인권센터
-- 매핑 메모:
-- - support_types 원문 근로장학금 -> ENUM `기타`
-- - 지원금액은 시급형으로 고정 금액 미정 -> support_amount_text 0 + support_amount_text에 원문 반영
-- - apply_end_date 시간 정보(17:00) 및 조기마감 가능성은 note/qual_special_info에 보존
-- - 학점등록은 enum 부재 -> qual_enrollment_status는 재학, 원문은 qual_special_info에 보존

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
  '2026-1학기 인권센터 대동제 근로장학생 모집',
  '이화여자대학교 인권센터',
  '대학교',
  ARRAY['기타']::support_category[],
  '2026년 최저임금을 시간 단위로 계산하여 지급 (사전 비대면 OT 시간 포함)',
  DATE '2026-05-10',
  DATE '2026-05-10',
  NULL,
  3,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY[
    '정규 및 학점등록생 가능(휴학생, 과정수료생 불가)',
    '성적기준 없음',
    '지정된 근무 일시(5/20, 5/22 오전) 참여 가능자',
    '접수 마감: 2026-05-10 17:00 (지원 인원 많을 시 조기 마감 가능)'
  ]::text[],
  false,
  ARRAY['근로장학생 신청서(지정 양식)']::text[],
  '이메일 접수',
  'mailto:juyoung1109@ewha.ac.kr',
  'https://www.ewha.ac.kr/',
  '02-3277-3229',
  E'접수 메일: juyoung1109@ewha.ac.kr\n'
  || E'메일 제목 형식: [근로장학생 지원] 이름(학번)',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '이화여자대학교 인권센터'
    AND s.name = '2026-1학기 인권센터 대동제 근로장학생 모집'
);
