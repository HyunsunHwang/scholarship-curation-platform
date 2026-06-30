-- 2026학년도 1학기 오승환 및 동문장학금 — 홍익대학교 컴퓨터공학과
-- 매핑 메모:
-- - institution_type: 원문「학교」→ `학교법인`
-- - support_types: 금액만 명시 → `학업장려금`, 100만 원
-- - apply_start_date 미제공 → collected_at(2026-06-02)
-- - 마감 시각(메일 수신 기준)은 note·qual_special_info

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
  can_overlap,
  required_documents,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  selection_stages,
  selection_stage_1,
  selection_stage_1_schedule,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026학년도 1학기 오승환 및 동문장학금 (홍익대학교 컴퓨터공학과)',
  '홍익대학교 컴퓨터공학과',
  '학교법인',
  ARRAY['학업장려금']::support_category[],
  '100만 원',
  DATE '2026-06-02',
  DATE '2026-06-05',
  NULL,
  4,
  ARRAY['홍익대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['컴퓨터공학과'],
  ARRAY[
    '학업성적이 우수하고 경제적 지원이 필요한 학생',
    '접수 마감: 2026-06-05 (이메일 수신시간 기준)'
  ]::text[],
  false,
  ARRAY[
    '신청서',
    '신청사유서',
    '소득분위증명서'
  ]::text[],
  '이메일 접수 (bluezone4508@hongik.ac.kr)',
  '',
  'https://wwwce.hongik.ac.kr',
  'bluezone4508@hongik.ac.kr',
  E'신청서에 장학금 수혜 이력 작성 필수. 항목 미기재 및 날인 없을 시 미접수.\n'
  || E'접수 마감은 메일 수신시간 기준. 심사 및 지급일: 6월 중(수혜 선정자만 개별 연락).',
  1,
  '서류심사',
  '2026년 6월 중 심사·지급(선정자 개별 연락)',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '홍익대학교 컴퓨터공학과'
    AND s.name = '2026학년도 1학기 오승환 및 동문장학금 (홍익대학교 컴퓨터공학과)'
);
