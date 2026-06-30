-- 중앙대학교 인문대학 2026학년도 1학기 역량강화장학금(특성화)
-- institution_type: 「대학교」→ `학교법인`
-- support_types: 「장학금(역량강화)」→ `등록금`
-- 접수 공란(자동 사정): apply_end_date NOT NULL → 2026-01-01 ~ 9999-12-31 + note 안내
-- announcement_date 단일값 불가 → 발표 시기는 일정·note에 반영
-- selection_count 수치 없음(예산 범위 문구) → NULL, 설명은 note
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
  '2026학년도 1학기 인문대학 역량강화장학금(특성화)',
  '중앙대학교 인문대학',
  '학교법인',
  ARRAY['등록금']::support_category[],
  800000,
  '1인 20만 원 ~ 80만 원 차등 지급 (선발 인원 및 예산에 따라 변동 가능)',
  DATE '2026-01-01',
  DATE '9999-12-31',
  NULL,
  NULL,
  ARRAY['중앙대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2, 3, 4]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['인문대학']::text[],
  NULL,
  1.88,
  '내국인'::nationality_type,
  ARRAY[
    '2026학년도 1학기 인문대학 재학생',
    '직전학기 16학점 이상 이수(4학년은 13학점 이상), F학점 미보유',
    '레인보우 비교과 실적 보유자 (실적 기간: 2026.01.01 ~ 06.30, 프로그램 ''수료'' 기준)',
    '제외: 수업연한 초과자, 평점 미산출자(교환학생·인턴십 등), 외국인 장학생, 비교과 실적 없음'
  ]::text[],
  true,
  ARRAY['별도 신청 절차 없음 (단과대학 자동 사정; 추가 안내 시 별도 통보)']::text[],
  '별도 신청 없이 단과대학별 장학 사정 후 자동 선발',
  'https://rainbow.cau.ac.kr',
  'https://humanities.cau.ac.kr',
  '인문대학 교학지원팀',
  E'[접수] 별도 신청·접수 기간 없음 (단과대학 자동 사정). 서비스 표기용 마감일은 상시모집 처리됩니다.\n'
  || E'[발표] 2026년 7월 ~ 8월 중 단과대학 자체 발표.\n'
  || E'[선발 인원] 단과대학 배정 예산 범위 내 선발.\n'
  || E'[평가 기준: 총 100점] 학습역량(성적) 40점 + 비교과역량(마일리지) 60점.\n'
  || E'[유의] 각 비교과 프로그램의 수료 처리 확인 책임은 참여 학생 본인 및 운영 부서. 기간 내 확인 필수.\n'
  || E'[중복 수혜] 수업료 실 납부 금액 범위 내 수혜 가능 (타 장학금으로 전액 장학생인 경우 0원 선발될 수 있음).',
  1,
  '장학 사정 및 선발 (학생 비교과 실적 취합 및 배점 환산)',
  '선발 후 2026년 8월 중 장학금 지급',
  '2026년 7월 ~ 8월 중',
  DATE '2026-05-16',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '중앙대학교 인문대학'
    AND s.name = '2026학년도 1학기 인문대학 역량강화장학금(특성화)'
);
