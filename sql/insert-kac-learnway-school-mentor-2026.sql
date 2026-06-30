-- 2026 한국공항공사 지역공부방 Learnway school 멘토 — 한국공항공사·희망친구 기아대책
-- institution_type: 원문 「공공기관/NGO」→ ENUM 단일값 `공공기관`, NGO는 organization 문자열에 반영
-- support_types: 멘토링·대외활동은 ENUM 외 → `학업장려금` + `기타`
-- can_overlap: 원문 NULL → 보수적 기본 false (다른 장학금 중복 수혜는 공고 확인)
-- 접수: 기대플러스 https://hope.kfhi.or.kr/

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university,
  qual_school_location, qual_school_category, qual_enrollment_status, qual_major,
  qual_special_info,
  can_overlap,
  required_documents, apply_method,
  apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1, selection_stage_2,
  selection_note,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026 한국공항공사 지역공부방 ''Learnway school'' 멘토 모집',
  '한국공항공사 / 희망친구 기아대책',
  '공공기관',
  ARRAY['학업장려금', '기타']::support_category[],
  1200000,
  '장학금 120만 원',
  '2026-05-06',
  '2026-05-15',
  NULL,
  40,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  NULL, -- 원문 「4년제/전문대 등 명시적 제한 없음」→ 학교 유형 필터 미부여
  ARRAY['재학', '휴학']::enrollment_status_type[],
  NULL,
  ARRAY[
    '잔여 학기 2학기 이상(졸업 임박·잔여 1학기 이하 지원 불가)',
    '서울(강서·양천 인근) 또는 전남(목포·무안) 소재 주 지정 지역아동센터 오프라인 방문·활동 가능자',
    '중학교 1~3학년 수준 수학·영어 1:1 학습 지도 가능자 (전공 무관)',
    '선발: 서울 20명, 목포·무안(전남) 20명'
  ]::text[],
  false,
  ARRAY[
    '멘토 참가신청서(기대플러스 지정 양식)',
    '신청서 내 별도 안내된 제출 서류'
  ]::text[],
  '온라인 접수 (기아대책 기대플러스 홈페이지 공고 참조)',
  'https://hope.kfhi.or.kr/',
  'https://www.airport.co.kr/',
  '02-2085-8284 / yelynnee@kfhi.or.kr',
  E'활동기간: 7.1~8.21(총 40시간).\n'
  || E'서류 합격자 대상 면접심사: 5.27~28.\n'
  || E'발대식·수료식·OT 등 필수 대면 일정 참석(공고 준수).\n'
  || E'담당: 기아대책 ESG 나눔본부 CSR1팀 이예린 간사.',
  2,
  '서류심사',
  '면접심사 (5.27~28)',
  '서울 20명, 목포·무안(전남) 20명',
  '2026-05-06',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '2026 한국공항공사 지역공부방 ''Learnway school'' 멘토 모집'
);
