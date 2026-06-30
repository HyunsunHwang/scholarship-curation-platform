-- 디자인예술경영학부 특별 장학금 — 홍익대학교 디자인예술경영학부
-- 매핑 메모:
-- - institution_type: 원문「학교」→ `학교법인`
-- - support_types: 등록금 40% 감면 → `등록금`, support_amount_text에 비율 명시
-- - apply_end_date 미제공·자동 신청 → `9999-12-31`(상시모집)
-- - qual_enrollment_status: 「신입」→ `신입생`, 「편입」은 enum 없음 → qual_special_info에 편입생 반영
-- - can_overlap: false (교내 40% 초과 장학금과 중복 불가)

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
  '디자인예술경영학부 특별 장학금 (홍익대학교 디자인예술경영학부)',
  '홍익대학교 디자인예술경영학부',
  '학교법인',
  ARRAY['등록금']::support_category[],
  '등록금의 40% 감면',
  DATE '2026-06-02',
  DATE '9999-12-31',
  NULL,
  NULL,
  ARRAY['홍익대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학', '신입생']::enrollment_status_type[],
  ARRAY['디자인예술경영학부', '디자인경영융합학부'],
  ARRAY[
    '직전학기 15학점 이상 이수 및 성적경고 없음',
    '수강학기 8학기 이내(재수강 삭제 학기 포함)',
    '신입생·편입생: 별도 학점·성적 조건 없이 자동 수혜(편입생은 입학 후 첫 학기 종료 후 환불)',
    '재학생: 위 요건 충족 시 자동 신청·사정'
  ]::text[],
  false,
  ARRAY['별도 신청 없음 (자동 신청)']::text[],
  '자동 신청 (별도 신청 없음)',
  '',
  'https://iim.hongik.ac.kr',
  '홍익대학교 디자인예술경영학부',
  E'지원금액: 등록금의 40% 감면(신/편입생은 입학 후 첫 학기 종료 후 환불).\n'
  || E'교내장학금 중 등록금 40% 초과 장학금(홍익인간/자주/창조/한마음)과 중복 불가.\n'
  || E'재수강 삭제 학기도 8학기 제한에 포함.',
  1,
  '자동 사정·선발',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '홍익대학교 디자인예술경영학부'
    AND s.name = '디자인예술경영학부 특별 장학금 (홍익대학교 디자인예술경영학부)'
);
