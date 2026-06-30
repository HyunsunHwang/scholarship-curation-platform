-- 예강희망키움재단 — 2026 예강 저널리즘스쿨 1기
-- support_category 에 '교육·멘토링' 없음 → 교육/실무 프로그램: 학업장려금+기타, 해외연수: 해외연수비

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
  qual_min_academic_year,
  qual_min_academic_semester,
  qual_enrollment_status,
  qual_major,
  qual_income_level_max,
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
  '2026 예강 저널리즘스쿨 1기',
  '예강희망키움재단',
  '민간재단',
  ARRAY['학업장려금', '기타', '해외연수비']::support_category[],
  0,
  '실무형 저널리즘 멘토링 교육 전액 지원 및 우수자 해외 연수',
  DATE '2026-04-20',
  DATE '2026-05-07',
  NULL,
  20,
  NULL,
  NULL,
  NULL,
  3,
  NULL,
  ARRAY[
    '재학',
    '휴학',
    '수료',
    '졸업'
  ]::enrollment_status_type[],
  NULL,
  NULL,
  false,
  ARRAY[
    '언론인 지망생',
    '[우대] 중위소득 120% 이하',
    '[우대] 장애, 다문화, 한부모, 조손가정 등'
  ]::text[],
  ARRAY['지원서(지정양식)'],
  '이메일 제출 — yegang@yegangfoundation.org',
  '',
  NULL,
  '02-3789-7863 / journalism@thebutter.org',
  $note$
파일명: '예강 저널리즘스쿨 1기 지원서_ooo(실명 기재)', 우수기사 중앙일보 공익섹션 게재 기회 제공
$note$,
  1,
  '서류 검토 후 선발(세부 공고 확인)',
  '선발 정원 및 일정은 주최처 공고를 확인하세요.',
  '2026-05-07까지(이메일)',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '예강희망키움재단'
    AND s.name = '2026 예강 저널리즘스쿨 1기'
);
