-- 2026년 대학생 청소년교육지원 장학금(통칭 대청교) — 한국장학재단
-- support_category ENUM에 근로·멘토링 레이블 없음 → `기타` + support_amount_text·note 에 유형 명시
-- support_amount NOT NULL 제약으로 시급제는 정액 미정의 표현을 0 처리(상세는 support_amount_text)
-- apply_end_date NOT NULL 제약으로 공고 종료 「대학별 상이」 안내 및 2026-12-31 플레이스홀더(실제 마감은 소속 학교·KOSAF 공고 확인)
-- qual_gpa_min: 원문은 백분위 70(C0); 프로필은 4.5 만점 → NULL 처리 후 note

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_nationality, qual_gpa_min,
  qual_special_info,
  can_overlap,
  required_documents, apply_method,
  apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026년 대학생 청소년교육지원 장학금',
  '한국장학재단',
  '공공기관',
  ARRAY['기타']::support_category[],
  0,
  '청소년 멘토링 활동 근로(시급) 유형 · 시간당 12,790원 (학기당 최대 640시간)',
  '2026-02-19',
  '2026-12-31',
  NULL,
  NULL,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  '내국인',
  NULL,
  ARRAY[
    '성범죄 등 관련 결격사유에 해당하지 않는 자',
    '매년 3월~차년도 2월까지 멘토링 활동 필수'
  ]::text[],
  true,
  ARRAY['온라인 신청서']::text[],
  '온라인 및 모바일 앱 신청 (한국장학재단 홈페이지 또는 앱)',
  'https://www.kosaf.go.kr/',
  'https://www.kosaf.go.kr/',
  '1599-2290 / kormentoring@kosaf.go.kr',
  E'통칭: 대청교.\n'
  || E'지원 종료일·추가 서류 등은 참여 소속 대학별로 상이함. 본 페이지의 접수 종료일(2026-12-31)은 시스템 필수값용이며 반드시 소속 교 및 한국장학재단 공고로 확인할 것.\n'
  || E'모집·성적 요건 등: 해당 학기 학생부 백분위 70점(C0 등급 상당, 공고 참고)—프로필 학점 필드와 스케일이 다를 수 있음.\n'
  || E'휴학생·시간제 등록생 불가 등 결격 요건 및 중복 신청 규정은 공고 참고.\n'
  || E'국적: 대한민국 국적.\n'
  || E'활동 장소: 초·중·고교, 지역아동센터 등(어린이집·유치원·노인복지시설 불가). 일 활동 시간 상한 등 공고 준수.',
  1,
  '선발 후 멘토링 활동 및 정산',
  '2026-05-03',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '한국장학재단'
    AND s.name = '2026년 대학생 청소년교육지원 장학금'
);
