-- 2026 화성시 꿈드림 장학생 모집
-- 매핑 메모:
-- - institution_type 원문 "지자체 / 출자·출연기관" -> 단일 enum `지방자치단체`
-- - support_amount_text 범위형(100만~250만) -> 최대값 2500000 저장, 상세는 support_amount_text에 보존
-- - apply_start_date/apply_end_date 시간 정보는 qual_special_info에 보존 (DB는 DATE)
-- - qual_income "학자금 지원 5구간 이하"는 DB 정수 소득필드와 스케일 차이로 qual_special_info에 보존

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
  qual_region,
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
  '2026 화성시 꿈드림 장학생 모집',
  '화성시 / 화성시인재육성재단',
  '지방자치단체',
  ARRAY['학업장려금']::support_category[],
  '생활비 성격 장학금: 기본 100만 원 ~ 최대 250만 원(유형별 상이)',
  DATE '2026-05-06',
  DATE '2026-05-22',
  NULL,
  509,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['경기도 화성시']::text[],
  ARRAY[
    '공고일 기준 본인 또는 부·모 중 1명이 화성시에 계속 거주',
    '일반 유형: 한국장학재단 학자금 지원구간 5구간 이하',
    '자립준비청년(보호연장/보호종료청년) 지원 가능',
    '선발 인원: 일반 486명, 자립 14명, 지정기탁 9명 등 총 509명',
    '접수시간: 2026-05-06 10:00 ~ 2026-05-22 17:00(시간 엄수)'
  ]::text[],
  false,
  ARRAY['공고문 제출서류(유형별 상이)']::text[],
  '온라인 접수 (화성시인재육성재단 홈페이지)',
  'https://www.hstree.org',
  'https://www.hstree.org',
  '031-898-8347',
  '화성시인재육성재단 장학사업팀',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '화성시 / 화성시인재육성재단'
    AND s.name = '2026 화성시 꿈드림 장학생 모집'
);
