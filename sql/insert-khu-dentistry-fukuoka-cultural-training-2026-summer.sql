-- 2026 하계 일본 후쿠오카 대학 문화연수 프로그램
--
-- 매핑 메모:
-- • institution_type 입력값 '대학교'는 enum 제약상 '학교법인'으로 매핑
-- • support_types 입력값 '{해외연수, 대외활동}'은 enum 제약상 {'해외연수비', '기타'}로 매핑
-- • qual_grade 컬럼은 현재 스키마에 없어 qual_gpa_last_semester_min + qual_special_info로 이관
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
  qual_gpa_last_semester_min,
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
  '2026 하계 일본 후쿠오카 대학 문화연수 프로그램',
  '경희대학교 치과대학',
  '학교법인',
  ARRAY['해외연수비', '기타']::support_category[],
  0,
  '추후 안내 (현재 구체적 금액 미정)',
  DATE '2026-06-05',
  DATE '2026-06-05',
  4,
  ARRAY['경희대학교']::text[],
  ARRAY['치의학과']::text[],
  ARRAY['재학']::enrollment_status_type[],
  2.0,
  ARRAY[
    '1학년 ~ 4학년 재학생 대상',
    '직전학기 평점 2.0 이상',
    '직전학기 15학점 이상 취득 필수',
    '치과대학 장학 지급기준 충족자',
    '방문 학생 간담회 지원 의무',
    '3, 4학년은 병원 실습 일정 개별 조정 필수'
  ]::text[],
  ARRAY['문화연수 프로그램 참가 신청서 (지정 양식)']::text[],
  '이메일 접수 (khsc0800@khu.ac.kr)',
  'mailto:khsc0800@khu.ac.kr',
  'https://dental.khu.ac.kr',
  'khsc0800@khu.ac.kr (치과대학 행정실)',
  E'접수 마감: 2026-06-05 23:59\n'
  || E'치과대학 전체 중 4명 선발.\n'
  || E'문화연수 및 학생 간 교류 지원 프로그램.',
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
  WHERE s.organization = '경희대학교 치과대학'
    AND s.name = '2026 하계 일본 후쿠오카 대학 문화연수 프로그램'
);
