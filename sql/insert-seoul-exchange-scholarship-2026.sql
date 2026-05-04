-- (재)서울미래인재재단 — 2026년 서울인재해외교환학생장학금
--
-- 처리 메모:
-- • 백분위 85점 — 프로필 gpa 필드 스케일과 달라 qual_gpa_* 미설정 → qual_special_info 로 안내·수동 검토
-- • 원문 「서울지역 대학」은 학교 이름과 정규 매칭되지 않아 qual_university 는 NULL (대신 qual_region 서울 + 안내 문자열)

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
  qual_region,
  qual_enrollment_status,
  qual_major,
  qual_gpa_min,
  qual_gpa_last_semester_min,
  qual_income_level_min,
  qual_income_level_max,
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
  selection_stage_1_schedule,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026년 서울인재해외교환학생장학금',
  '(재)서울미래인재재단',
  '공공/지자체 재단',
  ARRAY['생활비']::support_category[],
  0,
  '아시아 4,000,000원 / 비아시아 5,500,000원',
  DATE '2026-05-18',
  DATE '2026-05-27',
  DATE '2026-07-06',
  60,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['서울', '서울특별시'],
  ARRAY['재학', '휴학']::enrollment_status_type[],
  NULL,
  NULL,
  NULL,
  1,
  4,
  '내국인'::nationality_type,
  true,
  ARRAY[
    '대한민국 국적자',
    '2026년 2학기 교환학생 파견 예정자 (정규학기 학점 인정되는 과정). 교환학생 선발절차 진행 중이어도 신청 가능',
    '전 학년 평량평균 백분위 85점 이상 (성적증명서 백분위 포함, 공고일 이후 발급분 인정 등 공고 확인)',
    '서울 소재 4년제·전문대·전공대학 정규학기 학부생 (원격대학·기술대 등 제외) — 공고 및 소속 대학 소재지 자격 추가 확인',
    '학자금 지원구간 1~4구간·기초생활수급자·법정 차상위계층 등 경제 요건 (프로필 소득구간은 참고, 세부는 공고·서류)',
    '선발 규모: 아시아 15명, 비아시아 45명 (공고 기준)'
  ]::text[],
  ARRAY[
    '온라인 신청서',
    '신청자 체크리스트 및 서약서',
    '자기소개서',
    '재(휴)학증명서',
    '성적증명서(백분위 포함)',
    '경제상황 증빙서류(택1)'
  ],
  '재단 홈페이지 온라인 신청',
  'https://www.hissf.or.kr',
  'https://www.hissf.or.kr',
  '02-725-2257 / 070-8667-3511',
  $n$
타 교환학생 지원 목적 장학금과는 중복수혜 제한(공고 확인). 장학생 선발 후 의무 활동(EX-체인저스, 멘토링 등) 있음.
제출 서류는 공고일(2026-04-29) 이후 발급분만 인정 등 공고 기준 준수.
모교·파견교 장학금 및 일반 등록금·생활비 장학금과의 중복수혜는 공고상 인정 범위 확인.
$n$,
  1,
  '서류·요건 검토 후 선발',
  '2학기 파견 시 재학 필수 등 세부 일정·접수 시간은 재단 공고를 확인하세요.',
  '접수: 2026-05-18 10:00 ~ 2026-05-27 16:00',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '(재)서울미래인재재단'
    AND s.name = '2026년 서울인재해외교환학생장학금'
);
