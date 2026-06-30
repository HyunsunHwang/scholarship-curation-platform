-- AUA · 칭화대 Postgraduate Academic Forum / 20th NECDS 연계 — 서울대 소속 학생 참가 안내 행사
--
-- 매핑 메모:
-- • support_category 「컨퍼런스」ENUM 부재 → `해외연수비`·`학업장려금`·`기타`(행사·여비 성격 반영)
-- • institution_type 「해외 대학 / 학교」→ 원문 표기 근거 `해외 대학`(DB text)·organization 에 서울대 병기
-- • 학부생/대학원생: 학적 ENUM에 부재 → `qual_school_category`(4년제·대학원) + 재학 상태
-- • apply_method는 이메일 접수지만 apply_url 규격상 문자열 필요 → 빈 문자열 + 본문·contact 명시

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
  '아시아대학연맹(AUA) Postgraduate Academic Forum (칭화대) — 부제: 20th NECDS',
  '중국 칭화대학교 / 서울대학교',
  '해외 대학',
  ARRAY['학업장려금', '해외연수비', '기타']::support_category[],
  1000000,
  '대면 참석자 중 장학·여비 신청자에 한해 선발되어 최대 100만 원 수준 지원 가능·세부는 행사 안내 참고',
  NULL,
  DATE '2026-03-15',
  NULL,
  NULL,
  ARRAY['서울대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '대학원']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  NULL,
  NULL,
  false,
  ARRAY[
    'AUA 소속 대학 자격으로 신청 — 서울대 소속 가능 여부·접수 경로는 교내 국제교류·장학 공지로 확인',
    '행사 대면(In-person)·온라인(Online) 하이브리드 가능 — 지원금(여비)은 대면 참석 신청 대상에게만 해당(공고 기준)',
    '행사 주제(Environmental)·박사과정 학술 행사(NECDS) 성격 상 관련 분야 학생에게 유리할 수 있음(전공 명시 제한 없음)'
  ]::text[],
  ARRAY[
    '요구 자료(행사 안내 첨부·이메일 수신 패키지 기준 순서)·세부 증명은 교내 또는 칭화대 담당자 안내 참고'
  ],
  $n$
칭화대 행사 담당(ndac@tsinghua.edu.cn)에게 필요 서류 패키지를 이메일로 제출합니다. 교내 우회 제출 규정이 있으면 국제교류팀 확인.
$n$,
  '',
  NULL,
  'ndac@tsinghua.edu.cn',
  $n$
행사 기간: 2026. 5. 16.(토) ~ 5. 19.(화).
포럼 명: 20th National Environmental Conference for Doctoral Students (NECDS) — AUA Postgraduate Academic Forum (칭화대) 연계 프로그램.
$n$,
  2,
  '이메일 접수(칭화대 담당자 직접 제출) 및 서류 검토',
  '행사·지원 마감 처리',
  '접수·일정 세부 및 지원 신청 패키지는 교내 국제 교류 업무처와 교차 확인하세요.',
  CURRENT_DATE,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships s
  WHERE s.organization = '중국 칭화대학교 / 서울대학교'
    AND s.name LIKE '아시아대학연맹(AUA) Postgraduate Academic Forum (칭화대)%'
);
