-- 글로벌경영학과 교환학생 장학금 (2026-1 수정버전) — 성균관대학교 글로벌경영학과
-- 매핑 메모:
-- - support_types: 해외연수·학업보조비 → 해외연수비 + 학업장려금
-- - support_amount_text: 가변 → 0 + support_amount_text
-- - 신청 기간 1학기(1~2월)/2학기(7~8월) 이원화 → DB는 2학기 상한 대표 2026-08-31, 상세는 qual_special_info·note
-- - qual_special_info 원문 「재직 중 1회」는 동일 안내 관례상 「재적 중 1회」로 저장
-- - 장학: 직전 평균 2.0·12학점 / 교환 선발: 누적(전체) 평점 3.0 이상 → qual_gpa_last_semester_min 2.0, qual_gpa_min 3.0

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
  qual_gpa_min,
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
  '글로벌경영학과 교환학생 장학금 (2026-1 수정버전)',
  '성균관대학교 글로벌경영학과',
  '대학교',
  ARRAY['해외연수비', '학업장려금']::support_category[],
  '기본 지원(체재비+항공료) + 소득분위별 차등 지원. 파견 지역 및 소득분위에 따라 최종 산정.',
  DATE '2026-08-31',
  DATE '2026-08-31',
  NULL,
  NULL,
  ARRAY['성균관대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['글로벌경영학과'],
  3.0,
  2.0,
  ARRAY[
    '직전학기 12학점 이상 이수',
    '정규학기 교환학생 파견자(단기 파견 제외)',
    '재적 중 1회 제한',
    '파견 중 최소 9학점 이수 의무(미달 시 장학금 반환 기준 적용)',
    '신청 기간(매 학기·출국 전): 1학기 파견 약 1~2월, 2학기 파견 약 7~8월 — 학과 별도 안내 기한 엄수',
    '교환 목적 타 장학금과의 중복은 불가(일반 성적장학금 등과의 중복 가능 여부는 공고 기준)'
  ]::text[],
  true,
  ARRAY[
    '장학금 지원 신청서',
    '수혜 확인서(자필 서명)',
    '자기소개서 및 학업계획서(자유양식)',
    '소득분위 확인서(해당자)'
  ]::text[],
  '방문 또는 이메일 접수 (국제관 2층 90206호 또는 skkugba@skku.edu)',
  '',
  'https://www.skku.edu/',
  '02-760-0037 (글로벌경영학과 행정실)',
  E'모든 서류는 하나의 PDF로 병합 제출.\n'
  || E'apply_end_date는 2학기 신청 구간(7~8월) 상한을 대표한 값이며, 1학기(1~2월) 일정은 학과 공지를 확인할 것.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '성균관대학교 글로벌경영학과'
    AND s.name = '글로벌경영학과 교환학생 장학금 (2026-1 수정버전)'
);
