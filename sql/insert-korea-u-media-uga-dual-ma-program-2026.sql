-- 고려대학교 미디어대학 — 미디어학부–UGA 학·석사 연계 프로그램 학생 선발 (접수 2026-04-27 ~ 2026-05-10)
-- institution_type 「학교」→ 고려대학교 관련 행 관례에 맞춤 ENUM `대학교`
-- support_types 「해외연수」→ `해외연수비`
-- 중복 방지: organization + name

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
  qual_nationality,
  can_overlap,
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
  selection_stage_4,
  selection_stage_5,
  selection_note,
  selection_stage_1_schedule,
  selection_stage_2_schedule,
  selection_stage_3_schedule,
  selection_stage_4_schedule,
  selection_stage_5_schedule,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '미디어학부-UGA 학·석사 연계 프로그램 학생 선발',
  '고려대학교 미디어대학 / University of Georgia (UGA)',
  '대학교',
  ARRAY['등록금', '해외연수비']::support_category[],
  'UGA 수학 기간 중 조지아 주 거주자 기준 등록금 적용 및 본교 등록금 전액 지원',
  DATE '2026-04-27',
  DATE '2026-05-10',
  NULL,
  NULL,
  ARRAY['고려대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학', '휴학']::enrollment_status_type[],
  ARRAY['미디어학부'],
  ARRAY[
    '2026년 2학기 기준 미디어학부 총 5학기를 마칠 수 있는 자',
    '2027년 봄 학기부터 UGA 수학이 가능한 자',
    '5년 내 본교 학사 및 UGA 석사(광고·PR 분야) 동시 취득 과정'
  ]::text[],
  NULL,
  true,
  ARRAY[
    '지원서 (지정 양식)',
    '자기소개서 (SOP, 국문 또는 영문, 지원 동기 포함)',
    '성적증명서'
  ],
  '이메일 제출',
  '',
  'https://mediakorea.korea.ac.kr',
  '미디어대학행정팀 (02-3290-1403 / jjbk@korea.ac.kr)',
  $note$
공고문 기준 제출 방법·서식은 미디어대학 공지를 확인해 주세요. 공고에 선발 인원이 0명으로 표기된 경우는 학부에 확인이 필요할 수 있습니다.
지원 유의사항 (원문 안내 반영): 이메일 제목 및 파일명은 UGA지원서 제출_이름,
  학번 형식으로 제출합니다.
$note$,
  3,
  '1차 서류 심사',
  '2차 면접 심사(5월 중)',
  '최종 선발',
  NULL,
  NULL,
  '서류 합격자 개별 통보 — 면접 일정 등은 학부별 안내 참고.',
  NULL,
  '5월 중(면접)',
  NULL,
  NULL,
  NULL,
  DATE '2026-05-04',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '고려대학교 미디어대학 / University of Georgia (UGA)'
    AND s.name = '미디어학부-UGA 학·석사 연계 프로그램 학생 선발'
);
