-- 도전학기제 21기 모집 — 이화여자대학교(미래혁신센터/대학혁신지원사업)
-- 매핑 메모:
-- - support_types 원문 학업보조비/대외활동/학점인정 -> ENUM `학업장려금` + `기타`
-- - 학점등록은 enum 부재 -> qual_enrollment_status는 `재학`, 원문은 qual_special_info에 보존
-- - apply_end_date 시간 정보(17:00)는 note/qual_special_info에 보존
-- - apply_start_date 미제공 -> apply_end_date와 동일일 설정

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
  '도전학기제 21기 모집',
  '이화여자대학교 (미래혁신센터 / 대학혁신지원사업)',
  '대학교',
  ARRAY['학업장려금', '기타']::support_category[],
  4000000,
  '최대 400만 원(개인/팀별 상이) + 컨설팅 + 학점 지원',
  DATE '2026-05-21',
  DATE '2026-05-21',
  NULL,
  NULL,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY[
    '3학기 이상 학부 재학생',
    '26-2학기 기준 정규/학점등록생 대상(휴학생, 수료생, 교환/방문학생 불가)',
    '개인 또는 팀 단위 지원(복수 신청 불가)',
    '성적 제한 명시 없음(단, 3학기 이상 이수 필수)',
    '미래설계장학금 기수혜자 및 중복 수혜 불가',
    '캡스톤디자인 등 타 교내 프로그램과 동일 과제 중복 진행 불가',
    '접수 마감: 2026-05-21 17:00'
  ]::text[],
  false,
  ARRAY['구글폼 신청서(공고 양식)']::text[],
  '온라인 접수 (Google Forms)',
  '',
  'https://www.ewha.ac.kr/',
  '02-3277-4277 / future@ewha.ac.kr',
  '지원금, 컨설팅, 학점 동시 지원 프로그램.',
  1,
  '서류심사 및 프로젝트 적합성 검토',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '이화여자대학교 (미래혁신센터 / 대학혁신지원사업)'
    AND s.name = '도전학기제 21기 모집'
);
