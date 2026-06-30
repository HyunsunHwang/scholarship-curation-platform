-- 글로벌경제학과 교환학생 장학금 — 성균관대학교 글로벌경제학과
-- 매핑 메모:
-- - support_types: 해외연수·학업보조비 → 해외연수비 + 학업장려금
-- - support_amount: 개인·지역·소득분위별 가변 → 0 + 상세는 support_amount_text
-- - 신청 마감: 1학기·2학기 이원화(2월 말/7월 말) → DB는 DATE 1개만 가능
--   → 2026-2학기 기준 대표 마감 2026-07-31, 이원 일정은 qual_special_info·note
-- - apply_start_date 미제공 → apply_end_date와 동일(보수적)

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university, qual_school_location, qual_school_category, qual_enrollment_status, qual_major,
  qual_gpa_last_semester_min, qual_special_info, can_overlap,
  required_documents, apply_method, apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '글로벌경제학과 교환학생 장학금',
  '성균관대학교 글로벌경제학과',
  '대학교',
  ARRAY['해외연수비', '학업장려금']::support_category[],
  0,
  '파견 지역 및 소득분위에 따라 최종 산정액 지급. 기본 지원 + 소득분위별 차등 지원.',
  DATE '2026-07-31',
  DATE '2026-07-31',
  NULL,
  NULL,
  ARRAY['성균관대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['글로벌경제학과'],
  2.0,
  ARRAY[
    '직전학기 12학점 이상 이수',
    '정규학기 교환학생 프로그램 파견 확정자',
    '재적 중 1회로 제한',
    '파견교 도착 후 GE Arrival Form 제출 필수',
    '신청 마감(매년): 1학기 파견 약 2월 말, 2학기 파견 약 7월 말 — 출국 전 안내된 기한 내 제출',
    '교환학생 목적 타 장학(미래에셋, 아셈듀오 등) 수혜자는 지원 불가'
  ]::text[],
  false,
  ARRAY[
    '장학금 지원서',
    '장학금 수혜 확인서',
    '자기소개서 및 학업계획서',
    '소득분위 확인서(차등지원 희망자)'
  ]::text[],
  '이메일 접수 (skku.gecon@skku.edu)',
  '',
  'https://www.skku.edu/',
  'skku.gecon@skku.edu',
  E'자기소개서·학업계획은 자유 양식.\n'
  || E'표시된 apply_end_date는 2학기(7월 말) 신청 마감을 대표한 값이며, 1학기(2월 말) 일정은 학과 공지를 확인할 것.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '성균관대학교 글로벌경제학과'
    AND s.name = '글로벌경제학과 교환학생 장학금'
);
