-- 2026-1 Global SDGs Team Challenge 프로젝트
--
-- 매핑 메모:
-- • institution_type 입력값 '대학교'는 enum 제약상 '학교법인'으로 매핑
-- • support_types 입력값 '{해외연수, 대외활동, 학업보조비}'는 enum 제약상 {'해외연수비', '기타', '학업장려금'}으로 매핑
-- • qual_grade 컬럼은 현재 스키마에 없어 qual_gpa_last_semester_min + qual_special_info로 이관
-- • apply_start_date 미제공으로, 운영 입력 기준에서 보정 필요

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  selection_count,
  qual_university,
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
  '2026-1 Global SDGs Team Challenge 프로젝트',
  '경희대학교 국제처 글로벌교육지원팀',
  '학교법인',
  ARRAY['해외연수비', '기타', '학업장려금']::support_category[],
  '지역별 100만~200만 원 지원 (우수팀 1인당 50만 원 추가)',
  DATE '2026-05-18',
  DATE '2026-05-18',
  8,
  ARRAY['경희대학교']::text[],
  ARRAY['재학']::enrollment_status_type[],
  2.0,
  ARRAY[
    '직전학기 12학점 이상 이수',
    '기타 교내장학 지급요건 충족자',
    '2~4인 1팀 (외국인 팀리더 + 한국인 팀원 1명 이상 필수)',
    '팀리더의 모국으로 현지 조사 수행(일주일 이내)',
    '국적, 학년, 전공, 캠퍼스 다양성 높을수록 우대',
    '학부 외국인 및 한국인 재학생 대상 (서울/국제캠퍼스 공통)'
  ]::text[],
  ARRAY['제안서(5페이지 내외)']::text[],
  '이메일 접수',
  'mailto:isss0216@khu.ac.kr',
  'https://global.khu.ac.kr',
  '서울 02-961-0216 / 국제 031-201-3967~8',
  E'접수 마감: 2026-05-18 23:59\n'
  || E'지원금: 지역별 차등 (대만/일본 100만 원 ~ 북/남미 200만 원 등).\n'
  || E'선발 규모: 8팀 내외.',
  false,
  1,
  '서류 심사',
  DATE '2026-05-10',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '경희대학교 국제처 글로벌교육지원팀'
    AND s.name = '2026-1 Global SDGs Team Challenge 프로젝트'
);
