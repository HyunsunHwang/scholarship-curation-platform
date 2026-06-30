-- (사)우양재단 — 2026년 청년밥상 장학금
-- institution_type 원문 「재단」→ `재단법인`
-- support_types 원문 비어 있음 → 식비 지원 장학금이므로 `생활비`
-- qual_academic_year 컬럼 원문 「졸업예정자」→ `qual_enrollment_status`에 반영

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
  qual_nationality,
  qual_school_location,
  qual_school_category,
  qual_enrollment_status,
  qual_gpa_last_semester_min,
  qual_income_level_max,
  qual_age_max,
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
  '2026년 청년밥상 장학금 (우양재단)',
  '우양재단',
  '재단법인',
  ARRAY['생활비']::support_category[],
  '총 100만원 (50만원×2회 분할 지급, 식비 목적 50% 이상 사용 필수)',
  DATE '2026-05-20',
  DATE '2026-06-05',
  NULL,
  90,
  '내국인',
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['재학', '졸업예정']::enrollment_status_type[],
  3.0,
  4,
  29,
  ARRAY[
    '2026년 2학기까지 정규학기 이수 후 2027년 2월 졸업 예정자',
    '건강한 식생활/자기돌봄에 관심 있고 재단 활동 성실 참여 가능자',
    '[제외] 자립준비청년, 북한이탈주민 등'
  ]::text[],
  false,
  ARRAY[
    '신청서 및 개인정보활용동의서',
    '재학증명서',
    '성적증명서',
    '가족관계증명서',
    '신분증 사본',
    '통장 사본',
    '소득증빙서류'
  ]::text[],
  '구글폼 제출',
  'https://www.wooyang.org/News/?idx=171391995&bmode=view',
  'https://www.wooyang.org',
  '02-324-1324',
  E'지원금 100만원은 분할 지급(각 50만원). 장학금의 50% 이상 식비 목적 사용 필수(영수증 제출), 주류/담배/생활비성 물품 등 사용 불가.\n'
  || E'면접 없이 서류전형 선발. 서류는 2026년 5월 이후 발급분만 인정. 자립준비청년, 북한이탈주민 등 제외.',
  1,
  '서류심사',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '우양재단'
    AND s.name = '2026년 청년밥상 장학금 (우양재단)'
);
