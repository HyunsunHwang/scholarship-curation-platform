-- 홍익대학교 전자전기공학부 교내 장학금 2종 (인간/자주/창조/협동 · 한마음/면학/정진)
-- 매핑 메모:
-- - institution_type: 원문「학교」→ `학교법인`
-- - support_types·금액: 공고 미기재 → `학업장려금`, 0
-- - apply_end_date 미제공 → `9999-12-31`(상시모집 표기·매칭 RPC)
-- - 국가장학금 1차 연동: apply_method·note·qual_special_info 반영

-- 1) 홍익인간/자주/창조/협동 장학금
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
  '홍익인간/자주/창조/협동 장학금 (홍익대학교 전자전기공학부)',
  '홍익대학교 전자전기공학부',
  '학교법인',
  ARRAY['학업장려금']::support_category[],
  NULL,
  DATE '2026-06-02',
  DATE '9999-12-31',
  NULL,
  NULL,
  ARRAY['홍익대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2, 3, 4]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['전자전기공학부'],
  3.3,
  ARRAY[
    '기본요건: 15학점 이상 취득, 1~3학년 사회봉사 10시간, SDP 입력',
    '추가요건: 각 학년/학기별 전공 및 MSC 학점 세부 이수 조건 상이(공지사항 세부 참조)',
    '한국장학재단 국가장학금 1차 신청 필수(미신청 시 탈락)'
  ]::text[],
  false,
  ARRAY[
    '사회봉사활동 실적 (10시간)',
    '지도교수상담(SDP) 입력'
  ]::text[],
  '한국장학재단 국가장학금 1차 신청 (자동 신청)',
  'https://www.kosaf.go.kr',
  'https://ee.hongik.ac.kr',
  '학부사무실 장학금 담당자',
  E'국가장학금 1차 신청 필수(미신청 시 탈락). 성적+비교과 가산점 합산.\n'
  || E'컴퓨터공학전공 특정 5과목 전공 인정. 대회 입상자 가산점.\n'
  || E'상치복학/편입/전과 등은 사무실 사전 통보 필수.',
  1,
  '성적·비교과 종합 심사',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '홍익대학교 전자전기공학부'
    AND s.name = '홍익인간/자주/창조/협동 장학금 (홍익대학교 전자전기공학부)'
);

-- 2) 한마음/면학/정진 장학금
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
  '한마음/면학/정진 장학금 (홍익대학교 전자전기공학부)',
  '홍익대학교 전자전기공학부',
  '학교법인',
  ARRAY['학업장려금']::support_category[],
  NULL,
  DATE '2026-06-02',
  DATE '9999-12-31',
  NULL,
  NULL,
  ARRAY['홍익대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2, 3, 4]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['전자전기공학부'],
  3.0,
  ARRAY[
    '공통 요건: 15학점 이상 취득',
    '정진 장학금: 직전 성적 3.0 이상 필수',
    '한마음/면학: 소득분위(70%)+성적(30%) 합산 선발(정진은 성적순)',
    '한국장학재단 국가장학금 1차 신청 필수(미신청 시 탈락)'
  ]::text[],
  false,
  ARRAY['한국장학재단 국가장학금 1차 신청(자동 연동)']::text[],
  '한국장학재단 국가장학금 1차 신청 (자동 신청)',
  'https://www.kosaf.go.kr',
  'https://ee.hongik.ac.kr',
  '학부사무실 장학금 담당자',
  E'국가장학금 1차 신청 필수(미신청 시 탈락). 정진 장학금은 성적순.\n'
  || E'한마음/면학 장학금은 소득분위(70%)+성적(30%) 합산하여 선발.\n'
  || E'상치복학/편입/전과 등은 사무실 사전 통보 필수.',
  1,
  '성적·소득분위 종합 심사',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '홍익대학교 전자전기공학부'
    AND s.name = '한마음/면학/정진 장학금 (홍익대학교 전자전기공학부)'
);
