-- 연세대학교 경영대학 — 국제우수학생 장학금 (YSB IAES) 2026-1학기
-- 중복 방지: organization + name
-- support_amount: 스키마 NOT NULL — 변동 금액은 0 + support_amount_text 로 안내
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
  qual_university,
  qual_school_location,
  qual_school_category,
  qual_min_academic_year,
  qual_min_academic_semester,
  qual_enrollment_status,
  qual_major,
  qual_nationality,
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
  '경영대학 국제우수학생 장학금 (YSB IAES)',
  '연세대학교 경영대학',
  '학교',
  ARRAY['생활비']::support_category[],
  0,
  '해당 학기 대학배정 진리장학금 수준 지급 (자유장학금 수혜자는 차액 지급)',
  NULL,
  DATE '2026-05-15',
  NULL,
  ARRAY['연세대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  2,
  NULL,
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['경영대학'],
  '외국인'::nationality_type,
  3.3,
  false,
  ARRAY[
    '외국인 전형 입학자',
    '복수학위생 제외',
    '직전학기 최소 12학점 이상 이수',
    '학칙 징계(학사경고 등) 사실 없는 자',
    'TOPIK 6급 / KLI 6급 / 세종한국어평가 621점 이상 취득자'
  ]::text[],
  ARRAY[
    '장학금 신청서',
    '성적증명서(직전학기 포함)',
    '한국어자격증 성적표'
  ],
  '이메일 제출 — scholarship.ysb@yonsei.ac.kr',
  '',
  'scholarship.ysb@yonsei.ac.kr',
  $$
작성 원본 서류를 하나의 PDF 파일로 병합 제출 (파일명: 2026-1 YSB IAES_학번_이름). 국내 은행 계좌 등록 필수.
$$,
  1,
  '서류심사',
  '2026-05-15까지(이메일, 세부 시간은 학과 공고 확인)',
  '제출 서류 및 학적·성적 요건 종합 검토 후 선발.',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '연세대학교 경영대학'
    AND s.name = '경영대학 국제우수학생 장학금 (YSB IAES)'
);
