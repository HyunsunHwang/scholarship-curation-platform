-- 2026학년도 2학기 장학금 — 홍익대학교 화학공학전공
-- 매핑 메모:
-- - institution_type: 원문「학교」→ enum `학교법인`
-- - support_types·support_amount_text: 공고에 미기재 → `학업장려금`, 금액 0
-- - apply_start_date 미제공 → collected_at(공고 수집일)과 동일
-- - 가산점·동점자 기준은 note, 학점·봉사·영어 요건은 qual_special_info

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
  '2026학년도 2학기 장학금 (홍익대학교 화학공학전공)',
  '홍익대학교 화학공학전공',
  '학교법인',
  ARRAY['학업장려금']::support_category[],
  NULL,
  DATE '2026-06-02',
  DATE '2026-06-12',
  NULL,
  NULL,
  ARRAY['홍익대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2, 3, 4]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['화학공학전공'],
  ARRAY[
    '이수학점: 전체 15학점 및 전공 12학점 이상 취득',
    '사회봉사: 10시간 이상(정진 및 4학년 제외)',
    '영어 성적: 학년별 정규/공식 시험 기준 점수 충족 필수'
  ]::text[],
  false,
  ARRAY[
    '사회봉사활동 증명서 (또는 헌혈증)',
    '영어 성적표'
  ]::text[],
  '이메일 접수 (hyuk199611@hongik.ac.kr)',
  '',
  'https://chemeng.hongik.ac.kr',
  '02-320-1130 / hyuk199611@hongik.ac.kr',
  E'가산점: 전공 실험/창의적 설계 과목당 0.1점, 화학공학전공 12학점 초과 시 1학점당 0.03점.\n'
  || E'동점자 발생 시 이수학점 및 평점 기준 적용. 전공 미진입자 및 재수강 1학년 제외.',
  1,
  '서류심사',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '홍익대학교 화학공학전공'
    AND s.name = '2026학년도 2학기 장학금 (홍익대학교 화학공학전공)'
);
