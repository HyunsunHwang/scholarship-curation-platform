-- 2026 하계 해외 전공연수 (영어영문학과)
--
-- 매핑 메모:
-- • institution_type 입력값 '대학교'는 enum 제약상 '학교법인'으로 매핑
-- • support_types 입력값 '{해외연수, 학업보조비, 학점인정}'은 enum 제약상 {'해외연수비', '학업장려금', '기타'}로 매핑
-- • support_amount_text 범위값(300만~330만)은 숫자 컬럼 제약상 최소값 3000000 저장 + 범위는 support_amount_text/note에 보존
-- • apply_end_date '24:00'은 date 컬럼 제약상 2026-05-18로 저장하고 시각 정보는 note에 보존
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
  qual_major,
  qual_enrollment_status,
  qual_gpa_last_semester_min,
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
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026 하계 해외 전공연수 (영어영문학과)',
  '경희대학교 영어영문학과',
  '학교법인',
  ARRAY['해외연수비', '학업장려금', '기타']::support_category[],
  '1인당 최소 300만 ~ 최대 330만 원 지원 (파견비 지원, 전공 3학점 인정)',
  DATE '2026-05-18',
  DATE '2026-05-18',
  10,
  ARRAY['경희대학교']::text[],
  ARRAY['영어영문학과']::text[],
  ARRAY['재학']::enrollment_status_type[],
  2.0,
  false,
  ARRAY[
    '직전 학기 12학점 이상 이수 (교환학생은 9학점, 신입생은 본 학기 최소학점 기준)',
    '1학년~4학년 1학기 재학생 대상 (7학기 이내)',
    '7학기 초과자(학기초과자) 제외',
    '전공·어학연수 학점 3학점 초과 인정자 제외',
    '해외 경험 적은 순, 낮은 학년 순 선발 우대'
  ]::text[],
  ARRAY[
    '해외 전공연수 신청서',
    '여권 사본(선발 시)'
  ]::text[],
  '방문 또는 이메일 접수 (학과 사무실 방문 또는 khsc0108@khu.ac.kr)',
  'mailto:khsc0108@khu.ac.kr',
  'https://englishedu.khu.ac.kr',
  '02-961-0224 (영어영문학과 사무실)',
  E'접수 마감: 2026-05-18 24:00 (신청 기간 엄수)\n'
  || E'선발: 10명 내외.\n'
  || E'중복: 26 하계 교내 타 연수 프로그램 중복 수혜 불가.',
  1,
  '서류 심사',
  DATE '2026-05-10',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '경희대학교 영어영문학과'
    AND s.name = '2026 하계 해외 전공연수 (영어영문학과)'
);
