-- 연세대학교 생활과학대학 미주동문회 — 미주동문회장학금 2026학년도
--
-- 매핑 메모:
-- • enrollment 에 「입학예정」 라벨 없음 → 졸업·졸업예정(학부 졸업·종료 직전)만 자동 허용, 「미국 대학원 석·박 입학예정」은 qual_special_info
-- • qual_degree_level 컬럼 없음 → qual_special_info
-- • qual_major 는 단과명(생활과학대학)으로 단과 검색(ILIKE)·학과명 교차 매칭 흐름에 맞춤
-- • qual_region = 미국 은 프로필 주소가 대한민국 내인 경우 매칭 전원 탈락만 유발하므로 NULL (요건 문구만 qual_special_info)

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
  qual_region,
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
  '2026학년도 생활과학대학 미주동문회장학금',
  '연세대학교 생활과학대학 미주동문회',
  '동문회',
  ARRAY['생활비']::support_category[],
  2500000,
  '1인당 250만원 (총 2명 선발)',
  NULL,
  DATE '2026-05-11',
  NULL,
  2,
  ARRAY['연세대학교']::text[],
  ARRAY['국내 대학', '해외 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[
    '졸업'::enrollment_status_type,
    '졸업예정'::enrollment_status_type
  ],
  ARRAY['생활과학대학'],
  NULL,
  false,
  ARRAY[
    '연세대학교 학부 졸업생 한정 · 생활과학대(생활과학 관련 학부 과정)·공고의 동등 학력 포함 여부 확인',
    '미국 소재 대학원 석사 또는 박사 과정 입학예정 또는 입학(입학허가서 제출 필수, 공고 기준)',
    '진학 상태는 공고 「입학예정」에 해당 — 서비스 학적 enums에 입학예정 없음으로 자동 학적 게이트는 졸업/졸업예정 근사 + 서류 검토 필요'
  ]::text[],
  ARRAY[
    '지원서 및 자기소개서',
    '성적증명서(학부 및 대학원)',
    '진학 대학 입학허가서',
    '공인외국어성적증명서',
    '장학금 수혜 예정 확인서(해당자)'
  ],
  '이메일 제출 — woosou@yonsei.ac.kr',
  '',
  NULL,
  '02-2123-3094 (정우숙, 생활과학대학 행정팀)',
  $n$
5월 11일(월) 마감. 지원서 양식은 학과 공지사항 첨부파일 확인 필요.
$n$,
  1,
  '서류 심사 후 선발',
  '석·박 과정별 인원 분배·제출 증빙 양식은 공지를 확인하세요.',
  '2026-05-11(월) 마감(이메일)',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '연세대학교 생활과학대학 미주동문회'
    AND s.name = '2026학년도 생활과학대학 미주동문회장학금'
);
