-- (재)인천인재평생교육진흥원 — 2026년도 대학생 해외봉사 장학생 선발
--
-- 매핑 메모:
-- • support_category 에 '봉사활동' 없음 → 해외연수비 + 기타(실비·봉사 프로그램)
-- • 직전학기 3.0 / 신입 내신 등 이원 기준은 한 컬럼으로 무리 → qual_special_info 에 명시(자동 학점 게이트 없음)

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
  qual_region,
  qual_enrollment_status,
  qual_age_min,
  qual_gpa_min,
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
  selection_stage_2,
  selection_stage_3,
  selection_note,
  selection_stage_2_schedule,
  selection_stage_3_schedule,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026년도 대학생 해외봉사 장학생 선발',
  '(재)인천인재평생교육진흥원',
  '공공/지자체 재단',
  ARRAY['해외연수비', '기타']::support_category[],
  0,
  '항공권, 숙식, 여행자보험 등 해외봉사 관련 실비 전액 지원',
  DATE '2026-05-04',
  DATE '2026-05-20',
  DATE '2026-06-08',
  30,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['인천', '인천광역시'],
  ARRAY['재학', '휴학', '신입생']::enrollment_status_type[],
  19,
  NULL,
  NULL,
  false,
  ARRAY[
    '본인 또는 부모가 인천광역시 거주 (인천 소재 대학생은 거주지 무관)',
    '사회적 배려대상자 (기초생활수급자, 차상위계층, 한부모가족, 다문화가정 등)',
    '사전 OT, 발대식(3회) 및 해단식(9월 중) 필수 참석',
    '재학·휴학: 직전학기 평점평균 3.0/4.5 이상 등 공고 기준 · 신입생은 내신(5등급 등)·재학증명 분기 등 공고 확인',
    '만 19세 이상 등 연령·일정 세부 요건 공고 확인 (공고 예: 2007.8.5. 이전 출생)'
  ]::text[],
  ARRAY['온라인 신청서'],
  '온라인 접수 (재단 홈페이지)',
  'https://www.itle.or.kr',
  'https://www.itle.or.kr',
  '032-722-7254',
  $n$
파견지: 키르기스스탄 비슈케크 일대 (2026.8.4 ~ 8.14, 10박 11일). 해당 기간 참여 가능 여부 확인.
기타 증빙·세부 신청 방법은 재단 모집요강 참고.
$n$,
  3,
  '서류 심사',
  '면접 심사',
  '최종 발표',
  '합격 발표 시간 등은 재단 공고를 확인하세요.',
  '면접: 2026-06-04 (공고 확인)',
  '2026-06-08 18:00 합격자 발표 예정',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '(재)인천인재평생교육진흥원'
    AND s.name = '2026년도 대학생 해외봉사 장학생 선발'
);
