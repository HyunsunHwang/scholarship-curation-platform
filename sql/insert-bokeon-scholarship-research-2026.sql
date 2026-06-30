-- (재)보건장학회 — 2026년도 연구지원 장학생
--
-- 매핑 메모:
-- • support_category 「연구비」→ ENUM 미존재 → 연구 성격 반영하여 `학업장려금` + `기타`
-- • qual_nationality: DB는 내국인/외국인 → 대만·재외민 등 혼선 방지 위해 `내국인` + qual_special_info
-- • qual_university: 전국 대학 무제한 → NULL
-- • homepage_url 원문 안내문 → 재단 도메인 `https://www.kr-hff.or.kr` (공지·접수는 소속 학교 경유 재확인)
-- • apply_method 예시 접수처(SNU)·이메일은 원문 반영하되 「소속 학교 장학 부서 경유」 강조

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
  qual_academic_year,
  qual_enrollment_status,
  qual_major,
  qual_nationality,
  can_overlap,
  qual_special_info,
  required_documents,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  selection_stages,
  selection_stage_1,
  selection_stage_2,
  selection_note,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026년도 (재)보건장학회 연구지원 장학생',
  '(재)보건장학회',
  '민간재단',
  ARRAY['학업장려금', '기타']::support_category[],
  '1인당 500만 원 · 타 기관 등록금/생활비 장학과 중복 수혜 가능',
  NULL,
  DATE '2026-05-11',
  NULL,
  NULL,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '대학원']::school_category_type[],
  NULL,
  ARRAY['재학', '휴학', '수료']::enrollment_status_type[],
  ARRAY['의학', '약학', '치의학', '한의학', '수의학', '간호학', '사회복지학'],
  '내국인'::nationality_type,
  true,
  ARRAY[
    '대한민국 국적(내국인) 해당자 — 공고·학교별 추가 자격 재확인',
    '박사학위 취득자는 지원 불가',
    '과거 (재)보건장학회 연구지원 장학금 수혜자는 지원 불가',
    '학회지 게재 예정 원저 논문의 제1저자, 차석연구자, 교신저자만 신청 가능 — 이미 완료되었거나 심사 중인 연구는 지원 불가(공고 재확인)',
    '지원자 소속 학과이거나, 다른 전공이어도 지도교수가 해당 학과(의·약·치·한·수·간호·사회복지 등) 소속이면 가능(공고·학교 규정 준수)',
    '학부생 및 석·박사 과정 포함 — 소속 학교 규정상 장학금 지급이 가능한 상태여야 함 · 학교별 내부 마감일 주의'
  ]::text[],
  ARRAY[
    '지원서',
    '연구계획서',
    '재학/휴학/수료증명서',
    '주민등록표 초본(민감정보 미포함 발급)',
    '지도교수 추천서',
    '총장 추천서'
  ],
  $n$
방문 또는 이메일 접수(소속 대학). 예시: 21동 213호 방문 또는 skhan0708@snu.ac.kr — 학교·학과마다 다르므로 소속 대학 장학 담당 부서 공지를 우선 확인하고,
  재단 공지(www.kr-hff.or.kr 재단소식)와 병행하세요.
$n$,
  'https://www.kr-hff.or.kr/',
  'https://www.kr-hff.or.kr/',
  'yh1963828@naver.com (재단) / skhan0708@snu.ac.kr (소속 학과·학교 접수처 예시, 공고 기준 확인)',
  $n$
[환수 조건] 2029년 8월 31일까지 KCI 등재지 이상 또는 SCIE·SSCI급 학술지에 원저 논문을 게재하고 사사 표기를 해야 함. 미이행 시 전액 반환 의무입니다. 세부 규정은 공문을 참고합니다.
$n$,
  2,
  '서류 검토 및 학교별 추합',
  '재단 최종 결정 및 선발',
  '실제 학교별 내부 마감일은 공문·소속 대학 공지를 우선 확인하세요(원문 마감일은 일부 학교 기준일 수 있음).',
  CURRENT_DATE,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '(재)보건장학회'
    AND s.name = '2026년도 (재)보건장학회 연구지원 장학생'
);
