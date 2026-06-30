-- 2026-1학기 학생성공 및 정용지 창의장학생 선발 — 성균관대학교
-- 매핑 메모:
-- - support_types: 학비감면·학업보조비 -> 등록금 + 학업장려금
-- - support_amount_text: 등록금 전액은 개인별 상이 -> 상한 참고로 250만(생활비 대체)을 저장, 상세는 support_amount_text
-- - apply_start_date 미제공 -> apply_end_date와 동일일
-- - 마감 11:59는 qual_special_info·note에 보존

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
  '2026-1학기 학생성공 및 정용지 창의장학생 선발',
  '성균관대학교',
  '대학교',
  ARRAY['등록금', '학업장려금']::support_category[],
  '등록금 전액 또는 학업지원금 250만 원',
  DATE '2026-05-15',
  DATE '2026-05-15',
  NULL,
  NULL,
  ARRAY['성균관대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  2.0,
  ARRAY[
    '직전학기 이수학점 12학점 이상(막학기 9학점)',
    '정용지 창의장학생: 단과대학별 1명 선발(인원 합산은 공고 확인)',
    '과거 동일 공적으로 수혜 이력 있는 자 재선발 지양',
    '학생회 활동 공적만으로는 선발 불가(신규 공적으로는 지원 가능)',
    '접수 마감: 2026-05-15 11:59(금요일 오전까지, 보수적)'
  ]::text[],
  true,
  ARRAY[
    '신청서',
    '개인정보수집이용동의서',
    '추천서',
    '학습계획서'
  ]::text[],
  '이메일 접수 (소속 학과사무실 메일로 송부)',
  '',
  'https://www.skku.edu/',
  NULL,
  E'서류는 반드시 한글(.hwp) 파일로 제출.\n'
  || E'등록금 초과 시 학업지원금 250만 원으로 대체 지급(공고 기준).',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '성균관대학교'
    AND s.name = '2026-1학기 학생성공 및 정용지 창의장학생 선발'
);
