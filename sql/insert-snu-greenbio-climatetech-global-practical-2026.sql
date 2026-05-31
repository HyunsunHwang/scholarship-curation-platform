-- 서울대학교 그린바이오 혁신융합대학사업단 — 2026 그린바이오 기후테크 글로벌 프렉티컬 프로젝트
--
-- 매핑 메모:
-- • support_category: 「프로젝트」·「연구비」 등 ENUM 미존재 → 프로그램 설명 성격 반영하여 `학업장려금`·`해외연수비`·`기타`(+텍스트)
-- • institution_type: 원문 「학교 교내 사업단」→ `대학교`
-- • 재학 신분 세부 휴학·졸업유예 제한: qual_enrollment_status는 재학만 넣고, 제외 규칙은 qual_special_info 보강
-- • 학위 단계 명시 없음 · 팀 과제 → 학제 제한 과도 매칭 방지 위해 필요 시 qual_school_category는 4년제+대학원

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount,
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
  '2026 그린바이오 기후테크 글로벌 프렉티컬 프로젝트',
  '서울대학교 그린바이오 혁신융합대학사업단',
  '대학교',
  ARRAY['학업장려금', '해외연수비', '기타']::support_category[],
  0,
  '최우수 5개 팀 대상 2027 MWC 스페인 바르셀로나 현장 프로그램(및 교육·시제품 제작 등) 참여 비용 형태 지원 포함 — 규모·항목별 상세 접수 페이지 및 사업단 공문 확인',
  DATE '2026-04-22',
  DATE '2026-05-06',
  NULL,
  NULL,
  ARRAY['서울대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '대학원']::school_category_type[],
  NULL,
  ARRAY['재학']::enrollment_status_type[],
  NULL,
  NULL,
  false,
  ARRAY[
    '서울대학교 재학생 2~3인 팀으로만 신청(개인 지원 불가)',
    '신청 시 ''그린바이오 혁신융합대학사업단 마이크로디그리(그린바이오 에코시스템 입문과정)'' 이수 필요 — 접수 페이지·공문 세부 재확인',
    '2026년 1학기부터 2027년 1학기까지 연속 재학 신분 유지 필수(공고 기준)·휴학생 및 졸업유예 상태는 불가 — 기타 학년·제한은 접수 페이지 참고'
  ]::text[],
  ARRAY[
    '온라인 신청서(접수 시스템 기준)·세부 증빙은 접수 페이지 안내 순서 참고'
  ],
  '온라인 접수',
  'https://nextstep.io.kr/greenbio',
  'https://nextstep.io.kr/greenbio',
  '02-880-4990',
  $n$
일정 참고 (공고 변경 가능): 약 6~8월 온라인 교육, 9~11월 멘토링 및 시제품 고도화, 11월 CO-SHOW 등 경진, 2027년 3월 바르셀로나 Mobile World Congress(MWC)·국제 프로그램 경로.
MWC 공식: https://www.mwcbarcelona.com/
$n$,
  3,
  '서류·팀 접수 검토',
  '사업 과정 교육·멘토링·평가(공고 순)',
  '최종 규모(우수 팀 규모·해외 프로그램 범위)는 접수 페이지 및 사업단 공지 우선 확인하세요.',
  CURRENT_DATE,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '서울대학교 그린바이오 혁신융합대학사업단'
    AND s.name = '2026 그린바이오 기후테크 글로벌 프렉티컬 프로젝트'
);
