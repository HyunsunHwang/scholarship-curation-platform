-- 2026-1학기 이화플러스 장학금 — 이화여자대학교(학생처 장학복지팀)
-- 매핑 메모:
-- - support_types 원문 학업보조비 -> ENUM `학업장려금`
-- - apply_start_date/apply_end_date 시간 정보는 qual_special_info에 보존 (DB는 DATE)

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
  '2026-1학기 이화플러스 장학금',
  '이화여자대학교',
  '대학교',
  ARRAY['학업장려금']::support_category[],
  1000000,
  '1인당 100만 원 (현금 지급, 생활비 지원 성격)',
  DATE '2026-05-06',
  DATE '2026-05-13',
  NULL,
  NULL,
  ARRAY['이화여자대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  2.0,
  ARRAY[
    '[선택] 소득분위 심사형 OR 가계곤란 서류심사형',
    '정규등록 학부 재학생 대상(신·편입생 포함, 외국인 유학생 제외)',
    '직전학기 평점 2.00/4.30 이상(신·편입생은 성적 기준 면제)',
    '접수시간: 2026-05-06 09:00 ~ 2026-05-13 17:00'
  ]::text[],
  true,
  ARRAY[
    '가족관계증명서',
    '건강보험자격득실확인서',
    '건강보험료 납부확인서',
    '지방세 세목별 과세증명서'
  ]::text[],
  '온라인 접수 (유레카 시스템 전면 활용)',
  '',
  'https://www.ewha.ac.kr/',
  NULL,
  E'등록금 초과 수혜 및 타 생활비 장학금 중복 지급 허용.\n'
  || E'''가계곤란 서류심사형'' 선택 시에만 제출 서류를 1개 PDF로 병합 제출.',
  1,
  '서류 심사 및 자격 검토',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '이화여자대학교'
    AND s.name = '2026-1학기 이화플러스 장학금'
);
