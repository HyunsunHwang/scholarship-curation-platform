-- 2026년 여름 학기 국제언어교육원 유학생도우미 봉사장학생 — 홍익대학교
-- 매핑 메모:
-- - institution_type: 원문「학교」→ `학교법인`
-- - support_types·금액: 공고 미기재 → `학업장려금`, 0
-- - OT·활동기간은 note·selection_stage_1_schedule

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
  qual_gpa_last_semester_min,
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
  '2026년 여름 학기 국제언어교육원 유학생도우미 봉사장학생 (홍익대학교)',
  '홍익대학교 국제언어교육원',
  '학교법인',
  ARRAY['학업장려금']::support_category[],
  NULL,
  DATE '2026-05-23',
  DATE '2026-06-07',
  DATE '2026-06-24',
  NULL,
  ARRAY['홍익대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  1.75,
  ARRAY[
    '직전학기 15학점 이상 취득 및 등록금 전액 납부자',
    '교내 타 유학생 도우미 장학금과 수혜 중복 불가',
    '활동기간: 2026.06.27~08.02 (5주, 15시간 이상)',
    '지원 시 동성끼리 연결 원칙'
  ]::text[],
  false,
  ARRAY['온라인 신청서(지정 양식)']::text[],
  '온라인 신청',
  'http://koreanle.hongik.ac.kr',
  'http://koreanle.hongik.ac.kr',
  '02-2176-5674',
  E'활동기간: 6.27~8.2(5주간, 15시간 이상 활동).\n'
  || E'OT 참석 필수: 6.26(금) 오후 6시 Google Meet (불참 시 자동 탈락).\n'
  || E'지원 시 동성끼리 연결 원칙.',
  1,
  '서류심사 및 면접(해당 시)',
  'OT: 2026-06-26(금) 18:00 Google Meet 필수',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '홍익대학교 국제언어교육원'
    AND s.name = '2026년 여름 학기 국제언어교육원 유학생도우미 봉사장학생 (홍익대학교)'
);
