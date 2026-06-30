-- 2026-1학기 미래자동차공학과 성적우수장학금 — 한양대 공과대학 RC·소프트웨어 행정(미래자동차공학과)
-- 매핑 메모:
-- - organization: 원문 쉼표 → `RC 소프트웨어 행정팀 / 미래자동차공학과` 로 정리
-- - support_types: 학비감면 → 등록금
-- - support_amount_text: 석차·% 차등 → 0 + support_amount_text
-- - 마감 17:00는 qual_special_info·note
-- - 학점 요건은 GPA 최소 없음 → qual_gpa_* 생략, 학점·학년은 qual_special_info

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
  '2026-1학기 미래자동차공학과 성적우수장학금',
  '한양대학교 공과대학 RC 소프트웨어 행정팀 / 미래자동차공학과',
  '대학교',
  ARRAY['등록금']::support_category[],
  '석차별 차등 지급: 등록금 100%, 50%, 100만 원(1~15등·공고 기준).',
  DATE '2026-05-17',
  DATE '2026-05-17',
  NULL,
  15,
  ARRAY['한양대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['미래자동차공학과', '자동차-SW융합', '미래자동차기술융합'],
  ARRAY[
    '1~4학년 재학생(신입생·9학기 이상·휴학생 제외 — 공고 기준)',
    '직전학기 총 15학점·전공 12학점 이상(4학년 2학기는 총 12학점·전공 9학점 이상)',
    '석차별 5명씩 총 15명(1~15등 수혜, 석차 구간은 공고 확인)',
    '주전공·자동차-SW융합·미래자동차기술융합 등 해당 전공군은 공고·학과 확인',
    '타 교내 장학금과 합산 가능하나 등록금 한도 내 지급',
    '접수 마감: 2026-05-17 17:00 — 신청 기간 엄수'
  ]::text[],
  true,
  ARRAY['성적우수장학금 신청서 (지정 양식)']::text[],
  '이메일 접수 (phoo1111@hanyang.ac.kr, 제목 및 파일명 양식 준수)',
  '',
  'https://www.hanyang.ac.kr/',
  'phoo1111@hanyang.ac.kr (미래자동차공학과·행정팀 안내)',
  E'이메일 제목·첨부 파일명 형식은 공고를 반드시 확인할 것.',
  1,
  '서류심사·성적 석차 산정',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '한양대학교 공과대학 RC 소프트웨어 행정팀 / 미래자동차공학과'
    AND s.name = '2026-1학기 미래자동차공학과 성적우수장학금'
);
