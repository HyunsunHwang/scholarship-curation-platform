-- 제42기 혜춘장학회 장학생 추천 (화학공학부) — 재단법인 혜춘장학회 + SKKU 화학공학부
-- 매핑 메모:
-- - institution_type: 사설재단/대학교 혼합 → 주관 재단 기준 `재단법인`
-- - support_types: 학업보조비·생활비성 → `학업장려금`(동일 계열 매핑; 비고에 생활비성 명시)
-- - apply_start_date 미제공 → apply_end_date와 동일
-- - 마감 14:00는 qual_special_info·note에 보존
-- - 성적 우수: 구체 컷 없음 → qual_special_info 텍스트만

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
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '제42기 혜춘장학회 장학생 추천 (화학공학부)',
  '재단법인 혜춘장학회 / 성균관대학교 화학공학부',
  '재단법인',
  ARRAY['학업장려금']::support_category[],
  '1인당 350만 원',
  DATE '2026-04-30',
  DATE '2026-04-30',
  NULL,
  NULL,
  ARRAY['성균관대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['화학공학부'],
  ARRAY[
    '성적 우수자(구체 컷오프는 공고·안내문 참조)',
    '가정환경 곤란자',
    '오프라인 증서수여식(6/5) 필수 참석 가능자',
    '접수 마감: 2026-04-30 14:00(오후 2시, 시간 엄수)'
  ]::text[],
  true,
  ARRAY[
    '신청서',
    '자기소개서',
    '개인정보동의서',
    '성적증명서',
    '재학증명서',
    '주민등록등본(주민번호 표기)',
    '부모 건강보험료 납부확인서',
    '가계 형편 증빙 서류(학자금 지원구간 통지서 등)'
  ]::text[],
  '이메일 접수 (innie9511@skku.edu, 제출 서류 스캔본 전송)',
  '',
  'https://www.skku.edu/',
  '031-290-7240 (성균관대 화학공학부 학부사무실)',
  E'신청 시 스캔본 제출. 선발 후 원본 제출(공고 기준).\n'
  || E'생활비성 장학금으로 등록금 초과 등과 중복 수혜 가능하다는 취지의 안내 — 세부는 공고·학과 확인.',
  1,
  '서류심사',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '재단법인 혜춘장학회 / 성균관대학교 화학공학부'
    AND s.name = '제42기 혜춘장학회 장학생 추천 (화학공학부)'
);
