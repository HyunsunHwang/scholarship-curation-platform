-- 연세대학교 GLC — 2026-2학기 GLD 연세장학금 (재외국민)
-- • 「복학」은 enrollment enum 없음 → 재학만 자동 허용, 복학은 qual_special_info
-- • 직전학기 2.5 → qual_gpa_last_semester_min
-- • 재외국민 자격 등은 특수항목 문자열 안내(DB 별 칼럼 없음)

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
  qual_university,
  qual_school_location,
  qual_school_category,
  qual_enrollment_status,
  qual_major,
  qual_nationality,
  qual_gpa_min,
  qual_gpa_last_semester_min,
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
  selection_stage_3,
  selection_note,
  selection_stage_1_schedule,
  selection_stage_2_schedule,
  selection_stage_3_schedule,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026-2학기 GLD 연세장학금 (재외국민)',
  '연세대학교 글로벌인재학부(GLC)',
  '학교',
  ARRAY['등록금']::support_category[],
  0,
  '2026-2학기 등록금 선감면(고지서 감면 발행). 타 장학금 합산액이 등록금을 초과할 수 없음.',
  DATE '2026-05-18',
  DATE '2026-06-19',
  DATE '2026-07-31',
  ARRAY['연세대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY[
    '글로벌인재학부',
    '글로벌인재학부(GLC)',
    'GLD',
    'GLC'
  ],
  '내국인'::nationality_type,
  NULL,
  2.5,
  true,
  ARRAY[
    '복학생 포함 — 학적은 재학이어야 하며 휴학·졸업·학기 초과 불가(공고 준수)',
    '직전학기 12학점 이상 이수',
    '한국장학재단 국가장학금 2026-2학기 신청(예정)자 필수',
    '재외국민 자격으로 입학한 자(입학 형태 확인은 공고·학부 규정 참조)'
  ]::text[],
  ARRAY[
    '가족관계증명서',
    '소득 증빙 서류(부모 모두)',
    '[선택] 재산/부채 증빙서류',
    '[선택] 기타 가계곤란 증빙자료'
  ],
  '구글폼 온라인 제출(학부 지정 링크, 공고 확인)',
  '',
  NULL,
  'glc@yonsei.ac.kr',
  $n$
국가장학금 소득분위 산출 후 심사 원칙(공고·안내 문서 우선 적용).
모든 서류는 한글 또는 영문(또는 번역 증명된 번역본) 준수, PDF 형식으로 하나의 파일 병합 제출 등 공고 기준 확인.
$n$,
  3,
  '온라인 신청 접수',
  '서류 및 소득·자격 심사',
  '합격 처리 및 학사 포털·이메일 안내 등',
  '일정 세부 및 구글폼 URL은 학부 공지 우선 참고.',
  '2026-05-18 ~ 2026-06-19',
  '~ 2026-07-31 이전 처리(심사 기간은 공고 준수)',
  '2026년 7월 말 경 학사 포털·이메일 등으로 통지 안내 예정',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '연세대학교 글로벌인재학부(GLC)'
    AND s.name = '2026-2학기 GLD 연세장학금 (재외국민)'
);
