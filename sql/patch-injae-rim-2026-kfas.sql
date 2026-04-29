-- KFAS-001: 2026년 인재림 제6기 장학생 (공고·CSV 기준 정합성 패치)
-- 기존 행이 '인재림 제6기 장학생' 등으로 들어간 경우에도 동일 조직·제6기로 식별해 갱신합니다.

UPDATE public.scholarships
SET
  name = '2026년 인재림 제6기 장학생',
  institution_type = '재단법인',
  support_types = ARRAY['학업장려금']::support_category[],
  support_amount = 8000000,
  support_amount_text = '800만원 (+활동비)',
  apply_start_date = '2026-04-20',
  apply_end_date = '2026-05-11',
  announcement_date = '2026-07-22',
  selection_count = 20,
  qual_school_location = ARRAY['국내 대학']::school_location_type[],
  qual_school_category = ARRAY['4년제']::school_category_type[],
  qual_academic_year = ARRAY[2::smallint, 3::smallint],
  qual_enrollment_status = ARRAY['재학', '휴학']::enrollment_status_type[],
  qual_nationality = '내국인',
  can_overlap = true,
  required_documents = ARRAY['지원서 및 에세이', '성적증명서', '교내외 활동 증빙자료'],
  apply_method = '온라인 접수',
  apply_url = 'https://www.kfas.or.kr',
  homepage_url = 'https://www.kfas.or.kr',
  contact = '02-6310-7881',
  note = '1년간 커리큘럼 풀참여가 가능한 자만 지원 가능합니다. 어학연수, 교환학생, 취업, 군복무 등으로 인해 프로그램 참여가 어려운 경우 지원할 수 없습니다. 타 기관 장학금 및 장학 프로그램과 중복 수혜가 가능합니다. 선발 인원 등 세부 사항은 공고(www.kfas.or.kr)를 확인하세요.',
  selection_stages = 3,
  selection_stage_1 = '서류심사',
  selection_stage_2 = '1차 면접',
  selection_stage_3 = '최종발표',
  selection_stage_4 = NULL,
  selection_stage_5 = NULL,
  selection_note = '면접심사 7월 16일 대면 참석 필수',
  selection_stage_1_schedule = '2026-07-13',
  selection_stage_2_schedule = '2026-07-16',
  selection_stage_3_schedule = '2026-07-22',
  collected_at = COALESCE(collected_at, '2026-04-27T00:00:00+09:00'::timestamptz),
  is_verified = true,
  updated_at = now()
WHERE organization = '한국고등교육재단 (KFAS)'
  AND name IN ('2026년 인재림 제6기 장학생', '인재림 제6기 장학생');
