-- (사)우양재단 — 2026 탈북민 새출발 프로젝트 주거안정 지원사업
-- institution_type 원문 「재단」→ `재단법인`
-- support_types 원문 비어 있음 → 주거안정 금전 지원이므로 `생활비`
-- 본인 직접 신청 불가(하나센터/지원단체 추천 필수), 대학생 포함 일반 가구 대상

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
  qual_age_min,
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
  '2026 탈북민 새출발 프로젝트 주거안정 지원사업',
  '우양재단',
  '재단법인',
  ARRAY['생활비']::support_category[],
  '월 50만원 (주거안정 지원, 매월 2~4가구 선발)',
  DATE '2026-06-01',
  DATE '2026-12-10',
  NULL,
  NULL,
  18,
  ARRAY[
    '북한이탈주민',
    '탈북민(북한이탈주민) 저소득 위기가구(무주택자). 신청일 기준 2개월 이내 새로운 거주지로 입주 예정인 가구.',
    '본인 직접 신청 불가(하나센터/지원단체 추천 필수)',
    '대학생 포함 일반 가구 대상'
  ]::text[],
  false,
  ARRAY[
    '신청서',
    '고유번호증 사본',
    '입주 예정 증빙서류',
    '통장사본',
    '신분증 사본',
    '북한이탈주민확인서 사본',
    '견적서'
  ]::text[],
  '이메일 접수 (wycare@wooyang.or.kr)',
  'https://www.wooyang.org/News/?bmode=view&idx=171284986',
  'https://www.wooyang.org',
  '02-333-2855',
  E'매월 1~10일 접수(6~12월, 예산소진 시 종료). 매월 2~4가구 선발.\n'
  || E'본인 직접 신청 불가(하나센터/지원단체 추천 필수). 대학생 포함 일반 가구 대상.',
  1,
  '추천·서류심사',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '우양재단'
    AND s.name = '2026 탈북민 새출발 프로젝트 주거안정 지원사업'
);
