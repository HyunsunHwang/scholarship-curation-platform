-- 중앙대학교 경영경제대학 역량강화장학금 (2026학년도)
-- institution_type: 사용자 입력 "대학교"는 enum 부재로 "학교법인"으로 정규화
-- 발표일이 "1학기 8월 / 2학기 차년도 2월" 형태라 announcement_date 단일값 대신 일정 문자열에 반영

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
  qual_academic_year,
  qual_enrollment_status,
  qual_major,
  qual_gpa_min,
  qual_gpa_last_semester_min,
  qual_nationality,
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
  selection_note,
  selection_stage_1_schedule,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026학년도 경영경제대학 역량강화장학금',
  '중앙대학교 경영경제대학',
  '학교법인',
  ARRAY['등록금']::support_category[],
  1000000,
  '등록금 범위 내 1인당 최대 100만 원',
  DATE '2026-04-01',
  DATE '2026-06-30',
  NULL,
  NULL,
  ARRAY['중앙대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2, 3, 4]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['경영경제대학 소속 전체 학과(부)']::text[],
  NULL,
  1.88,
  '내국인'::nationality_type,
  ARRAY[
    '외국인장학금 대상자는 제외',
    '수업연한 초과자 제외',
    '교환학생 제외',
    '해당 학기 16학점 이상 이수 필수',
    '비교과 실적이 전혀 없는 경우 선발 제외'
  ]::text[],
  true,
  ARRAY['별도 신청 절차 없음 (비교과 실적 제출 필요 시 별도 안내)']::text[],
  '자동선발 (레인보우시스템 실적 기반)',
  'https://rainbow.cau.ac.kr',
  'https://ebiz.cau.ac.kr',
  '중앙대학교 경영경제대학 교학지원팀',
  E'중복수혜는 가능하나 등록금 총액 범위 내에서만 인정됩니다.\n'
  || E'선발은 비교과 역량 80% + 학습 역량 20% 합산으로 진행됩니다.',
  1,
  '학습역량(20) + 비교과역량(80) 종합 평가',
  '비교과 실적이 전혀 없는 경우 선발 대상에서 제외',
  '1학기(8월), 2학기(차년도 2월) 발표',
  DATE '2026-05-14',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '중앙대학교 경영경제대학'
    AND s.name = '2026학년도 경영경제대학 역량강화장학금'
);
