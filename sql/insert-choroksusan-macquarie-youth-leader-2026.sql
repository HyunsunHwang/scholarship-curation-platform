-- 초록우산 어린이재단 (한국맥쿼리) — 2026년 맥쿼리 청년리더 양성 프로그램
-- institution_type: 「민간/기업」→ 주관 특성상 `재단법인` + 공동 브랜딩은 organization 문자열에 유지
-- support_types: 학업장려 + 멘토링·교육 → `학업장려금` + `기타`(프로그램 필수 참여 등)
-- qual_income_level_max: 「중위소득 70%」는 프로필 분위 체계와 직접 대응 불가 → qual_special_info·note에 명시
-- qual_school_category: 「대학교(4년제)」→ `4년제`
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
  qual_academic_year,
  qual_enrollment_status,
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
  selection_note,
  selection_stage_1_schedule,
  selection_stage_2_schedule,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026년 맥쿼리 청년리더 양성 프로그램',
  '초록우산 어린이재단 (한국맥쿼리)',
  '재단법인',
  ARRAY['학업장려금', '기타']::support_category[],
  '총 600만원 (학기당 300만원, 총 2학기 지원)',
  DATE '2026-05-11',
  DATE '2026-05-31',
  DATE '2026-06-23',
  10,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY[
    '중위소득 70% 이하 (기초생활수급자 및 차상위계층 등 취약계층 우선 선발)',
    '휴학생 제외',
    '맥쿼리 임직원 멘토링, 진로코칭, 발대식(6/29), 수료식 등 프로그램 전 과정 필수 참여 가능자'
  ]::text[],
  true,
  ARRAY[
    '지원 신청서',
    '자기소개서',
    '주민등록등본(뒷자리 미포함)',
    '개인정보 수집 및 이용 동의서'
  ]::text[],
  '이메일 접수 (초록우산 사회공헌협력본부 / sean@chorogusan.or.kr)',
  '',
  'https://www.childfund.or.kr',
  'sean@chorogusan.or.kr',
  E'1차 서류 ➔ 2차 오프라인 면접(맥쿼리 사옥) ➔ 최종 합격. 단순 생활비 지원이 아닌 청년리더 양성 목적이므로 오프라인 일정 참여가 필수적입니다.\n'
  || E'[중복 수혜] 교내장학금 및 국가장학금 중복 수혜 가능 (단, 타 기업 장학금 중복 수혜 불가).\n'
  || E'제출: 요청 서류를 파일 병합 후 PDF로 제출.',
  2,
  '서류 전형 (결과 발표: 2026-06-05)',
  '오프라인 면접 전형 (일시: 2026-06-17)',
  NULL,
  '1차 서류 합격자 발표 2026-06-05 → 2차 오프라인 면접 2026-06-17 → 최종 발표 2026-06-23(공고 기준).',
  '2026-06-05',
  '2026-06-17',
  DATE '2026-05-16',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '초록우산 어린이재단 (한국맥쿼리)'
    AND s.name = '2026년 맥쿼리 청년리더 양성 프로그램'
);
