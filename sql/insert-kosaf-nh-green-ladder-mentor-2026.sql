-- 2026학년도 푸른등대 NH농협은행 초록사다리 대학생 멘토 — 한국장학재단·NH농협은행
-- 멘토링·대외활동 레이블은 support_category ENUM 외 → 학업장려금 + 기타, 상세는 support_amount_text·note
-- 성적 요건은 백분위 70(C 상당); 프로필 학점 스케일과 상이할 수 있어 qual_gpa_* 는 NULL, qual_special_info·note 에 명시

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
  '2026학년도 푸른등대 NH농협은행 초록사다리 대학생 멘토 모집',
  '한국장학재단 / NH농협은행',
  '공공기관',
  ARRAY['학업장려금', '기타']::support_category[],
  '장학금 150만 원 + 활동지원금 70만 원',
  '2026-05-01',
  '2026-05-15',
  NULL,
  200,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['재학', '휴학']::enrollment_status_type[],
  ARRAY[
    '반드시 8~10명으로 멘토 팀을 구성하여 팀 단위로 지원 (개인 지원 불가)',
    '2026년 6~8월(하계 방학) 전체 캠프 일정 및 2박 3일 교외 합숙 필수 참여',
    '직전 학기 성적 백분위 70점(C학점 상당) 이상 — 신입생 지원 불가 (공고·성적증명서로 확인)',
    '사이버대·방통대 등 원격·평생교육시설 재학생 제외(공고 기준)',
    '2019~2025년 동일 사업(캠프) 멘토 참여 이력자 지원 불가',
    '대학원생·졸업생·자퇴생 등 학부 재·휴학생 외 지원 불가',
    '활동계획서 내 AI·첨단산업·ESG 교육 포함 시 가점, 한국장학재단 타 멘토링 사업 경력자 가점(공고)'
  ]::text[],
  false,
  ARRAY[
    '재/휴학증명서',
    '성적증명서',
    '멘토팀 활동계획서',
    '멘토 참여 서약서',
    '멘토링활동확인서(선택)'
  ]::text[],
  '온라인 접수 (한국장학재단 누리집 등 공고 경로 — 팀 대표)',
  'https://www.kosaf.go.kr/',
  'https://www.kosaf.go.kr/',
  '1599-2290',
  E'봉사 활동 완료 시 장학금 및 활동지원금 지급. 20개 팀 선발(팀당 8~10명 구성).\n'
  || E'총 활동 약 84시간(사전준비 12h, 교내 40h, 교외 24h, 환류 8h).\n'
  || E'접수·제출 서식의 정확한 URL은 모집 공지에서 확인할 것.',
  1,
  '서류심사 등(세부 일정은 공고 참고)',
  '2026-05-06',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '2026학년도 푸른등대 NH농협은행 초록사다리 대학생 멘토 모집'
);
