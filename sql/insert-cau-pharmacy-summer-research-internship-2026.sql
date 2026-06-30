-- 중앙대학교 약학대학 2026학년도 하계 연구 인턴십 프로그램
-- institution_type: 사용자 입력「대학교」등은 enum 부재로 `학교법인`으로 정규화
-- support_types: 원문 「장학금(인턴십 연구지원금)」→ DB enum에 연구비 라벨 없음 → `학업장려금`
-- qual_school_category: 원문 「대학교」→ 학부 매칭용 `4년제`
-- 접수 마감 시각은 apply_end_date(일자) + selection_stage_1_schedule에 반영
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
  selection_stage_1_schedule,
  selection_note,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026학년도 중앙대학교 약학대학 하계 연구 인턴십 프로그램',
  '중앙대학교 약학대학',
  '학교법인',
  ARRAY['학업장려금']::support_category[],
  '30만원',
  '2026-05-11',
  '2026-05-22',
  '2026-05-29',
  30,
  ARRAY['중앙대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['약학', '약학과'],
  ARRAY['학부 재학생 전용']::text[],
  true,
  ARRAY['참가신청서 1부'],
  '방문 접수 (약학대학 교학지원팀 102관 414호)',
  '',
  NULL,
  '02-820-5591',
  E'인턴기간: 2026.07.01~08.31 (총 4주 이상, 120시간 진행). 학장명의 수료증 발급. 무단결석·불성실 활동 시 장학금 제한 가능. 종료 후 활동결과보고서 제출 필수.',
  1,
  '서류접수 및 평가',
  NULL,
  NULL,
  '2026-05-22 18:00까지(방문 접수)',
  '선정 결과 개별 문자 및 이메일 통보',
  DATE '2026-05-16',
  true,
  false,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '중앙대학교 약학대학'
    AND s.name = '2026학년도 중앙대학교 약학대학 하계 연구 인턴십 프로그램'
);
