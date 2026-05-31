-- 경희대학교 간호과학대학 1학기 융합인재 장학금 (간호과학대학)
--
-- 매핑 메모:
-- • institution_type 입력값 '대학교'는 현재 enum에 없어 '학교법인'으로 매핑
-- • support_types 입력값 '{학업보조비, 역량개발}'은 현재 enum에 맞춰 {'학업장려금', '기타'}로 매핑
-- • 접수 시각(00:00/23:59) 정보는 date 컬럼 제약상 note에 보존

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  qual_university,
  qual_major,
  qual_special_info,
  required_documents,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  can_overlap,
  selection_stages,
  selection_stage_1,
  selection_stage_1_schedule,
  selection_note,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '1학기 융합인재 장학금 (간호과학대학)',
  '경희대학교 간호과학대학',
  '학교법인',
  ARRAY['학업장려금', '기타']::support_category[],
  200000,
  '2등급 기준 200,000 포인트 (20만 원)',
  DATE '2026-06-01',
  DATE '2026-06-12',
  ARRAY['경희대학교']::text[],
  ARRAY['간호학과']::text[],
  ARRAY['BLS provider 자격증 소지자']::text[],
  ARRAY['BLS provider 자격증 사본']::text[],
  '오프라인 접수 (해당 기간 내 행정실 직접 방문 제출)',
  'https://nursing.khu.ac.kr',
  'https://nursing.khu.ac.kr',
  '02-961-0305 (경희대 간호과학대학 행정실)',
  E'심사: 2026-06-15 ~ 2026-06-30\n'
  || E'지급: 2026-07-06 ~ 2026-07-17 (장학팀 예정)\n'
  || E'접수 시간: 2026-06-01 00:00 ~ 2026-06-12 23:59',
  true,
  1,
  '서류 심사',
  '2026-06-15 ~ 2026-06-30',
  '지급 예정: 2026-07-06 ~ 2026-07-17 (장학팀 안내 기준)',
  DATE '2026-05-10',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '경희대학교 간호과학대학'
    AND s.name = '1학기 융합인재 장학금 (간호과학대학)'
);
