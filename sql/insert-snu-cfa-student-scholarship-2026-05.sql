-- 서울대학교 × CFA Institute — 2026년 5월 CFA Student Scholarship (배치)
--
-- 매핑 메모:
-- • support_category: 「자격증·응시료」ENUM 부재 → CFA/CIPM 응시료 감면 성격을 `기타`(및 설명 텍스트)로 통일
-- • qual_enrollment_status: 「학부생/대학원생」은 학적 enum이 아님 → qual_school_category(4년제·대학원) + 재학·휴학
-- • 학부 전공 무관 vs 대학원 경영대만: qual_major만으로 동시에 표현 불가 → qual_major NULL + qual_special_info 명시
-- • institution_type 원문 혼합 → 주관이 서울대이므로 `대학교` (CFA는 organization 문자열에 반영)

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
  selection_note,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026년 5월 CFA Student Scholarship',
  '서울대학교 / CFA Institute',
  '대학교',
  ARRAY['기타']::support_category[],
  'CFA/CIPM 시험 응시료 장학·감면 형태의 혜택(프로그램·시험 윈도 공식 안내 기준)',
  DATE '2026-05-04',
  DATE '2026-05-17',
  NULL,
  NULL,
  ARRAY['서울대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '대학원']::school_category_type[],
  ARRAY['재학', '휴학']::enrollment_status_type[],
  NULL,
  NULL,
  false,
  ARRAY[
    '학부생: 전공 무관. 대학원생: 경영대학 소속만 해당(MBA 등 제외 규정·공지의 Kill Factor 우선)',
    '대략 2026년 11월 또는 2027년 2월 CFA(or CIPM) 응시 계획자 등 — 실제 허용 회차·레벨은 CFA Institute 스튜던트 스카십 프로그램 안내를 우선 확인',
    '시험에 이미 등록(결제)·예약한 이후에는 본 장학 혜택 신청 불가 — 반드시 시험 등록 전에 CFA 포털 학생 장학 신청을 완료',
    '신청 절차: (1) CFA Institute 온라인 개별 신청 (2) 서울대 구글 폼에 snu.ac.kr 계정으로 순서대로 통합된 단일 PDF 제출 등 — 양쪽 모두 필요(학교 장학 게시판 공지에 구글폼 주소 재확인)',
    '이전 수혜 신청에서 탈락한 사람도 이후 회차·배치 재지원이 허용되는 사례가 있으나 매 시즌 규정 및 포털 상태를 반드시 확인'
  ]::text[],
  ARRAY[
    '국문 성적증명서',
    '영문 학업계획서(지원 동기 포함, A4 1장)',
    '영문 자기소개서(A4 1장)'
  ],
  $n$
(1) CFA Institute 프로그램 온라인 개별 신청
(2) 서울대 구글폼(snucfags 게시판에 안내되는 폼 등, snu 도메인 전용) 제출 · 두 경로 모두 필수입니다.
$n$,
  'https://cfai.smapply.io/prog/cfa_program_student_scholarship/',
  'https://cfai.smapply.io/prog/cfa_program_student_scholarship/',
  'yjhototo@snu.ac.kr',
  $n$
합격 여부 등 선발 결과는 5월 말 경 CFA Institute 학생 장학 페이지에서 로그인해 개별 확인합니다(별도 합격 메일 미발송 사례가 있음). 서류 미비 시 안내 연락 없이 불합격 처리될 수 있습니다. 학교별 할당 한도 및 조기 신청 접수 종료 가능성 공지를 참고하세요.
$n$,
  1,
  '학교 접수 및 CFA Institute 프로그램 심사 일정 준수',
  '합격 결과는 CFA Institute 학생 장학 페이지에서 확인·할당 종료 가능성 및 이중 제출 규칙 등 CFA Institute 안내를 우선 확인하세요.',
  CURRENT_DATE,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships s
  WHERE s.organization = '서울대학교 / CFA Institute'
    AND s.name = '2026년 5월 CFA Student Scholarship'
);
