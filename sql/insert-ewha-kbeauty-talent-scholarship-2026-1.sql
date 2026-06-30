-- 2026-1학기 K-뷰티인재장학금 (학부)
-- 매핑 메모:
-- - support_types 원문 학비감면/학업보조비 -> ENUM `등록금` + `학업장려금`
-- - apply_end_date 시간 정보(17:00)는 qual_special_info에 보존 (DB는 DATE)
-- - qual_grade 복합조건(9학점 이상 + 누계평점 3.5/4.3)은 qual_special_info에 보존

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
  '2026-1학기 K-뷰티인재장학금 (학부)',
  '이화여자대학교 경영대학',
  '대학교',
  ARRAY['등록금', '학업장려금']::support_category[],
  5000000,
  '1인당 500만 원 (등록금 및 생활비 지원 성격 결합)',
  DATE '2026-05-06',
  DATE '2026-05-13',
  NULL,
  1,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['경영대학'],
  ARRAY[
    '경영대학 소속 한정',
    '직전 학기 9학점 이상 이수',
    '누계평점 3.5 이상(4.3 만점 기준)',
    '접수 마감: 2026-05-13 17:00(시간 엄수)'
  ]::text[],
  false,
  ARRAY[
    'K-뷰티장학금 신청서(자기소개서 포함)',
    '지방세 세목별 과세증명서(첨부파일 참조)'
  ]::text[],
  '방문 또는 이메일 접수',
  'mailto:biz@ewha.ac.kr',
  'https://biz.ewha.ac.kr',
  '02-3277-2777',
  '이화신세계관 3층 309호(경영대학행정실) 방문 또는 이메일 제출.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '이화여자대학교 경영대학'
    AND s.name = '2026-1학기 K-뷰티인재장학금 (학부)'
);
