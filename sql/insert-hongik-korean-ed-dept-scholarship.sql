-- 국어교육과 교내 장학금 — 홍익대학교 국어교육과
-- 매핑 메모:
-- - institution_type: 원문「학교」→ `학교법인`
-- - support_types: 등록금 감면+정액 장학 혼합 → `등록금`, `학업장려금`
-- - qual_gpa_last_semester_min: 1.75(면학/정진/한마음 하한), 상한·구간은 qual_special_info
-- - apply_end_date 미제공 → `9999-12-31`(상시모집)
-- - 국가장학금 연동 자동 신청

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
  qual_academic_year,
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
  '국어교육과 교내 장학금 (홍익대학교 국어교육과)',
  '홍익대학교 국어교육과',
  '학교법인',
  ARRAY['등록금', '학업장려금']::support_category[],
  '홍익(전액), 자주(80%), 창조(60%), 한마음(50%), 협동(40%), 면학(120만원), 정진(90만원)',
  DATE '2026-06-02',
  DATE '9999-12-31',
  NULL,
  NULL,
  ARRAY['홍익대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2, 3, 4]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['국어교육과'],
  1.75,
  ARRAY[
    '직전학기 15학점 이상',
    '홍익/자주/창조/협동: 직전학기 평점 3.3~4.0 및 사회봉사 10시간 이상(4학년 제외)',
    '면학/정진/한마음: 직전학기 평점 1.75~3.0, 사회봉사 무관',
    '공통: 직전학기 SDP 작성 및 사범대학 비교과 프로그램 2회 이상 참여',
    '한국장학재단 국가장학금 신청 필수(자동 신청 연동)',
    '학기초과·복학·재입학·휴학생 신청 불가'
  ]::text[],
  false,
  ARRAY[
    '한국장학재단 국가장학금 신청(자동 연동)',
    '직전학기 SDP 작성',
    '사범대학 비교과 프로그램 참여 실적'
  ]::text[],
  '한국장학재단 국가장학금 신청 (자동 신청)',
  'https://www.kosaf.go.kr',
  'https://koredu.hongik.ac.kr',
  '홍익대학교 국어교육과',
  E'지원금액: 홍익(전액), 자주(80%), 창조(60%), 한마음(50%), 협동(40%), 면학(120만원), 정진(90만원).\n'
  || E'교내 장학금 중복 수혜 불가.\n'
  || E'동점자: 마일리지>취득학점>전공평점>봉사시간>학과기여도>폭력예방교육 이수 순.\n'
  || E'학기초과/복학/재입학/휴학생 불가.',
  1,
  '성적·비교과·마일리지 종합 심사',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '홍익대학교 국어교육과'
    AND s.name = '국어교육과 교내 장학금 (홍익대학교 국어교육과)'
);
