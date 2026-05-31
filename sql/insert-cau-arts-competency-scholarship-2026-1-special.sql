-- 중앙대학교 예술대학 2026학년도 1학기 역량강화장학금(특성화)
-- institution_type: 「대학교」→ enum 정규화 `학교법인`
-- support_types: 「장학금(역량강화)」→ 등록금 연계 장학으로 `등록금`
-- 접수 기간 공란(자동 사정): DB NOT NULL 제약 → 시작일 + 마감일 `9999-12-31`(매칭 RPC 상시모집 처리). 실제 일정은 note 참고.
-- announcement_date 단일 일자 불가 → 발표 시기는 note·일정 필드에 반영
-- 선발 인원 괄호 설명은 note에 포함, selection_count는 수치 82
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
  '2026학년도 1학기 역량강화장학금(특성화)',
  '중앙대학교 예술대학',
  '학교법인',
  ARRAY['등록금']::support_category[],
  400000,
  '40만원 (1인 기준)',
  DATE '2026-01-01',
  DATE '9999-12-31',
  NULL,
  82,
  ARRAY['중앙대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2, 3, 4]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['예술대학']::text[],
  NULL,
  1.88,
  '내국인'::nationality_type,
  ARRAY[
    '2026학년도 1학기 학부 재학생',
    '성적우수장학금 수혜 기준 충족자 (직전학기 16학점 이상 이수, F학점 없음)',
    '레인보우시스템 비교과 마일리지 100점 이상 취득자 (실적 기간: 2026.01.01 ~ 06.30)'
  ]::text[],
  true,
  ARRAY['별도 신청 절차 없음 (단과대학 자동 사정; 추가 서류 요청 시 별도 안내)']::text[],
  '별도 신청 없이 단과대학별 장학 사정 후 자동 선발',
  'https://rainbow.cau.ac.kr',
  'https://art.cau.ac.kr',
  '중앙대학교 예술대학 교학지원팀',
  E'[접수] 별도 신청·접수 기간 없음 (단과대학 자동 사정). 서비스 표기용 마감일은 상시모집 처리됩니다.\n'
  || E'[평가 기준] 학습역량(30%) + 비교과역량(70%) 배점 합산 상위자 선발.\n'
  || E'[동점자 처리] 신청학점수 > 신청과목수 > 전공학점수 > 레인보우시스템 마일리지 상위자 순.\n'
  || E'[발표] 2026년 7월 중 단과대학 자체 발표.\n'
  || E'[선발 규모] 총 약 82명 (서울캠퍼스 약 12명 + 다빈치캠퍼스 약 70명).\n'
  || E'[중복 수혜] 등록금 수업료 실 납부 금액 범위 내 수혜 가능 (전액 장학생은 불가).',
  1,
  '단과대학별 장학 사정 및 선발',
  '선발 후 2026년 8월 장학금 지급',
  '2026년 7월',
  DATE '2026-05-16',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '중앙대학교 예술대학'
    AND s.name = '2026학년도 1학기 역량강화장학금(특성화)'
);
