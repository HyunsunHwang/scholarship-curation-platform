-- 2026 국가우수장학금(이공계) 재학중우수자 선발 — 성균관대학교 자연과학대학 생명과학과
-- 매핑 메모:
-- - institution_type: 대학교 / 한국장학재단 혼합 → 주관 학과 기준 `대학교`(사업 주체는 note·qual_special_info)
-- - support_types: 학비감면→등록금; 기초생활수급자 학업보조→학업장려금 병기
-- - support_amount: 등록금 전액은 개인별 → 0, 생활비 250만/학기는 support_amount_text·note
-- - 마감 23:59는 qual_special_info에 보존
-- - can_overlap 미제공 → 국가 등록금성 장학 관련 보수적 false

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university, qual_school_location, qual_school_category, qual_enrollment_status, qual_major,
  qual_gpa_min, qual_special_info, can_overlap,
  required_documents, apply_method, apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026 국가우수장학금(이공계) 재학중우수자 선발 (생명과학과)',
  '성균관대학교 자연과학대학 생명과학과',
  '대학교',
  ARRAY['등록금', '학업장려금']::support_category[],
  0,
  '2년(4학기) 정규학기 등록금 전액. 기초생활수급자는 학기당 생활비 250만 원 추가(공고·KOSAF 기준).',
  DATE '2026-05-11',
  DATE '2026-05-11',
  NULL,
  1,
  ARRAY['성균관대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['생명과학과'],
  3.5,
  ARRAY[
    '3학년(5~6학기) 재학생 전용(4학년 이상 제외 — 공고 기준)',
    '졸업이수학점의 40% 이상 취득 필수',
    '국가우수장학금(이공계) 수혜 이력 없는 자',
    '단과대학 최종 1명 선발(학과 추천 후 단대 경쟁)',
    '접수 마감: 2026-05-11 23:59(마감 시각 미상, 보수적)',
    '한국장학재단 국가우수장학금(이공계) 사업 — 세부·중복은 KOSAF·학과 공고 확인'
  ]::text[],
  false,
  ARRAY['국가우수장학금이공계 신청서(생명과학과 지정 양식)']::text[],
  '이메일 접수 (ksa4664@skku.edu)',
  '',
  'https://www.kosaf.go.kr/',
  'ksa4664@skku.edu',
  E'성균관대학교 생명과학과 차원 추천·접수이며, 최종 심사는 한국장학재단 등 공고를 따릅니다.',
  1,
  '서류심사·학과 추천',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '성균관대학교 자연과학대학 생명과학과'
    AND s.name = '2026 국가우수장학금(이공계) 재학중우수자 선발 (생명과학과)'
);
