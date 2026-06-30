-- 2026 삼양이건 미래인재 장학생 선발 (식품생명공학과)
-- 매핑 메모:
-- - institution_type 원문 사설재단/대학교 -> 주관 재단 기준 `재단법인`
-- - apply_start_date 미제공 -> apply_end_date와 동일일로 설정
-- - 마감 시각(11:00) 및 선착순 등은 qual_special_info·note에 보존
-- - can_overlap 원문 NULL -> 보수적 기본 false (재단 규정은 공고 확인)

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
  '2026 삼양이건 미래인재 장학생 선발 (식품생명공학과)',
  '삼양이건장학재단 / 성균관대학교 식품생명공학과',
  '재단법인',
  ARRAY['학업장려금']::support_category[],
  '학기당 200만 원(최대 4학기, 총 800만 원 지원 가능)',
  DATE '2026-04-30',
  DATE '2026-04-30',
  NULL,
  1,
  ARRAY['성균관대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['식품생명공학과'],
  ARRAY[
    '3학년 재학생 한정',
    '성적 우수자(구체 컷은 안내문 참조)',
    '학과장(또는 지도교수) 추천서 필수(자유 양식)',
    '접수 마감: 2026-04-30 11:00(시간 엄수, 매우 촉박)',
    '선착순 1명 선발'
  ]::text[],
  false,
  ARRAY[
    '삼양이건장학재단 장학금 지원 신청서',
    '개인정보수집 및 활용 동의서',
    '추천서',
    '기타 구비서류'
  ]::text[],
  '오프라인 접수 (식품생명공학과 학과사무실 직접 방문 제출)',
  '',
  'https://www.skku.edu/',
  NULL,
  E'공고 내 타 장학금 중복 수혜 여부 미기재 — 재단·학과 규정을 확인할 것.',
  1,
  '서류 심사(선착순)',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '삼양이건장학재단 / 성균관대학교 식품생명공학과'
    AND s.name = '2026 삼양이건 미래인재 장학생 선발 (식품생명공학과)'
);
