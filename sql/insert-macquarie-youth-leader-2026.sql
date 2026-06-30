-- 맥쿼리 2026 청년리더 양성 프로그램 — 초록우산(맥쿼리)
-- 매핑 메모:
-- • institution_type 원문 「민간재단/기업」은 enum 제약상 `재단법인`으로 저장
-- • 소득요건 「중위소득 70% 이하(우선선발)」는 분위수 컬럼과 직접 매핑이 어려워 qual_special_info 로 보존

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
  qual_school_location,
  qual_school_category,
  qual_academic_year,
  qual_enrollment_status,
  qual_region,
  can_overlap,
  qual_special_info,
  required_documents,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  selection_stages,
  selection_stage_1,
  selection_stage_2,
  selection_stage_3,
  selection_stage_4,
  selection_stage_5,
  selection_note,
  selection_stage_1_schedule,
  selection_stage_2_schedule,
  selection_stage_3_schedule,
  selection_stage_4_schedule,
  selection_stage_5_schedule,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '맥쿼리 2026 청년리더 양성 프로그램',
  '초록우산 (맥쿼리)',
  '재단법인',
  ARRAY['학업장려금', '기타']::support_category[],
  '장학금 지급 및 프로그램 지원 (총 600만원)',
  DATE '2026-05-11',
  DATE '2026-05-31',
  DATE '2026-06-23',
  10,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1::smallint, 2::smallint],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['서울']::text[],
  false,
  ARRAY[
    '중위소득 70% 이하 우선선발',
    '기초생활수급자/차상위계층 우선선발',
    '전공 제한 없음',
    '국적·성별·연령 제한 없음'
  ]::text[],
  ARRAY['공지사항 내 지정 서식']::text[],
  '이메일 접수 (sean@chorogusan.or.kr, siwonai8888@gmail.com)',
  'https://www.chorogusan.or.kr',
  'https://www.chorogusan.or.kr',
  '02-799-0477 (초록우산 사회공헌협력본부)',
  E'중복수혜: 교내 및 국가장학금은 가능, 그 외 기업/재단 장학금은 불가.\n'
  || E'맥쿼리 청년리더 프로그램 필수 참여.',
  5,
  '모집 및 서류 제출',
  '1차 합격자 발표',
  '면접심사',
  '최종발표',
  '발대식',
  '심사 결과 비공개, 제출 서류 반환 불가',
  '2026-05-31',
  '2026-06-05',
  '2026-06-17',
  '2026-06-23',
  '2026-06-29',
  DATE '2026-05-13',
  false,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '초록우산 (맥쿼리)'
    AND s.name = '맥쿼리 2026 청년리더 양성 프로그램'
);
