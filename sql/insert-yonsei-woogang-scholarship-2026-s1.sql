-- 우강장학재단 / 연세대학교 문과대 2026학년도 1학기
-- 중복 방지: organization + name
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
  qual_gpa_min,
  can_overlap,
  qual_special_info,
  required_documents,
  apply_method,
  apply_url,
  contact,
  note,
  selection_stages,
  selection_stage_1,
  selection_stage_1_schedule,
  selection_note,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026학년도 1학기 우강장학재단 장학생',
  '우강장학재단',
  '민간재단',
  ARRAY['생활비']::support_category[],
  2000000,
  '생활비성 장학금 200만원',
  NULL,
  DATE '2026-05-08',
  NULL,
  3,
  ARRAY['연세대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['문과대학'],
  3.7,
  false,
  ARRAY[
    '소득분위가 낮은 학생',
    '타 생활비성 장학금 미수혜자'
  ]::text[],
  ARRAY[
    '장학생 추천서',
    '재학증명서',
    '소득분위 증명서',
    '본인 명의 통장 사본'
  ],
  '이메일 제출 — mk.kim@yonsei.ac.kr',
  '',
  'mk.kim@yonsei.ac.kr',
  $$
모든 서류를 PDF 1개 파일로 제출 (파일명: 우강장학재단 지원_학과_학번_이름). 학과장 명의 추천서 제출 요망. 신청 마감 당일 15:00까지.
$$,
  1,
  '서류심사',
  '2026-05-08 15:00까지(이메일)',
  '제출 서류 종합 검토 후 선발(소득·학업 등 공고 기준).',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '우강장학재단'
    AND s.name = '2026학년도 1학기 우강장학재단 장학생'
);
