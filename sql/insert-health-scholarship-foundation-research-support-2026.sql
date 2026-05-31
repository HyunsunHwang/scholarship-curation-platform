-- 2026 재단법인 보건장학회 연구지원 장학생
--
-- 매핑 메모:
-- • institution_type 입력값 '사설재단'은 enum 제약상 '재단법인'으로 매핑
-- • support_types 입력값 '{학업보조비, 연구지원}'은 enum 제약상 {'학업장려금', '연구비'}로 매핑
-- • selection_count 입력값 0(인원 제한 없음)은 UI 의미 일관성을 위해 NULL로 저장
-- • apply_end_date 시각(23:59)은 date 컬럼 제약상 note에 보존
-- • apply_start_date 미제공으로, 운영 입력 기준에서 보정 필요

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  selection_count,
  qual_university,
  qual_major,
  qual_enrollment_status,
  qual_nationality,
  qual_special_info,
  required_documents,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  can_overlap,
  selection_stages,
  selection_stage_1,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026 재단법인 보건장학회 연구지원 장학생',
  '재단법인 보건장학회',
  '재단법인',
  ARRAY['학업장려금', '연구비']::support_category[],
  5000000,
  '1인당 500만 원 1회성 연구지원금',
  DATE '2026-05-12',
  DATE '2026-05-12',
  NULL,
  ARRAY['경희대학교']::text[],
  ARRAY['치의학', '의학', '약학', '한의학', '간호학', '사회복지학(보건의료정책)']::text[],
  ARRAY['재학']::enrollment_status_type[],
  '내국인',
  ARRAY[
    '보건의료 연구 계획/진행자',
    '저자 요건(제1저자, 차석, 교신저자 중 1) 충족자',
    '완료된 연구(심사 중 포함)는 지원 불가'
  ]::text[],
  ARRAY[
    '장학생 지원서류 일체',
    '재학증명서',
    '주민등록등본(주민번호 뒷자리 마스킹 가능)'
  ]::text[],
  '이메일 접수 (khsc0800@khu.ac.kr, 치의학 행정실)',
  'mailto:khsc0800@khu.ac.kr',
  NULL,
  E'접수 마감: 2026-05-12 23:59\n'
  || E'인원 제한 없음(적격자 선발).\n'
  || E'보건의료 관련 연구지원 장학 프로그램.',
  true,
  1,
  '서류 심사',
  DATE '2026-05-10',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '재단법인 보건장학회'
    AND s.name = '2026 재단법인 보건장학회 연구지원 장학생'
);
