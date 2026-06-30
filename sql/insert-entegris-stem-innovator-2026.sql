-- 2026 인테그리스 STEM Innovator 2기 모집
-- 매핑 메모:
-- - institution_type 원문 민간기업(외국계) -> ENUM `기업`
-- - support_types 원문 학업보조비/대외활동/인턴십 -> ENUM `학업장려금` + `기타`
-- - apply_end_date 시간 정보(23:59)는 qual_special_info에 보존 (DB는 DATE)
-- - apply_start_date는 원문 기준 유지, apply_end_date는 날짜만 저장

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
  '2026 인테그리스 STEM Innovator 2기 모집',
  '한국 인테그리스 (Entegris Korea)',
  '기업',
  ARRAY['학업장려금', '기타']::support_category[],
  '연 500만 원(상/하반기 각 250만 원) + 실무 과제 + 인턴 기회',
  DATE '2026-04-24',
  DATE '2026-05-11',
  NULL,
  NULL,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학', '휴학']::enrollment_status_type[],
  ARRAY['이공계열'],
  ARRAY[
    '4학기 이상 수료자(휴학생 가능)',
    '해외여행 결격사유 없는 자',
    '인테그리스 정기 활동(총 3회) 필수 참여',
    '접수 마감: 2026-05-11 23:59'
  ]::text[],
  true,
  ARRAY['지정 지원서 양식']::text[],
  '온라인 접수 (지정 지원서 양식 작성 후 채용 홈페이지 접수)',
  '',
  'https://www.entegris.com/',
  'Recruiting.korea@entegris.com',
  '메일 및 카카오채널(QR) 문의 가능.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '한국 인테그리스 (Entegris Korea)'
    AND s.name = '2026 인테그리스 STEM Innovator 2기 모집'
);
