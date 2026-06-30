-- 2026 국가우수장학금(이공계) 재학중우수자 (2년 지원) — 한양대학교 공과대학 / 한국장학재단
-- 매핑 메모:
-- - institution_type: 대학교·KOSAF 혼합 → 주관 단대 기준 `대학교`
-- - support_types: 학비감면→등록금; 기초수급 학업보조→학업장려금
-- - support_amount_text: 등록금 전액 개인별 → 0, 문구는 support_amount_text
-- - selection_count: 학과별 T.O → NULL
-- - 마감 16:00는 qual_special_info·note
-- - can_overlap: 미제공 → 국가 등록금성 보수적 false

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
  '2026 국가우수장학금(이공계) 재학중우수자 (2년 지원)',
  '한양대학교 공과대학 / 한국장학재단',
  '대학교',
  ARRAY['등록금', '학업장려금']::support_category[],
  '졸업 시까지(최대 4개 학기) 등록금 전액 지원. 기초생활수급자는 학기당 생활비 250만 원 추가(공고·KOSAF 기준).',
  DATE '2026-05-11',
  DATE '2026-05-11',
  NULL,
  NULL,
  ARRAY['한양대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['공과대학'],
  3.5,
  ARRAY[
    '3학년 재학생 전용',
    '누계평점 3.5 이상(4.5 만점) 또는 백분위 87점 이상 — 졸업이수학점 40% 이상 이수 필수',
    '이공계 국가장학금(국가우수장학금 이공계) 기 수혜자 제외',
    '등록 5회 초과자 제외(건축학부는 7회 초과자 제외)',
    '공과대학 행정팀 추천 후 한국장학재단 홈페이지 개별 신청 필수',
    '선발 인원: 공과대학 내 소속 학과별 T.O에 따름(학과별 상이)',
    '접수 마감: 2026-05-11 16:00 — 공과대학 행정팀 서류 제출 기준, 시간 엄수'
  ]::text[],
  false,
  ARRAY['재학중우수자 2년 지원 신청서 (지정 양식)']::text[],
  '이메일 접수 (danbi@hanyang.ac.kr, 공과대학 학과·담당자 확인)',
  '',
  'https://www.kosaf.go.kr/',
  'danbi@hanyang.ac.kr (한양대학교 공과대학 행정팀·학과 담당자 안내)',
  E'한양대학교 공과대학 차원 접수·추천이며, 최종 절차는 한국장학재단 및 학과 공고를 따릅니다.',
  1,
  '서류심사·단대 추천 후 재단 신청',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '한양대학교 공과대학 / 한국장학재단'
    AND s.name = '2026 국가우수장학금(이공계) 재학중우수자 (2년 지원)'
);
