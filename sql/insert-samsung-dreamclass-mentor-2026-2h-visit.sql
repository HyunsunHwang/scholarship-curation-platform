-- 삼성드림클래스 2026년 2학기 대학생멘토(유형1 방문멘토링)
-- 유의: 원문 지원유형 '복합지원'은 스키마 enum 호환을 위해 '학업장려금'으로 저장

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  announcement_date,
  qual_enrollment_status,
  can_overlap,
  required_documents,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  selection_stages,
  selection_stage_1,
  selection_stage_1_schedule,
  selection_stage_2,
  selection_stage_2_schedule,
  selection_stage_3,
  selection_stage_3_schedule,
  selection_stage_4,
  selection_stage_4_schedule,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026년 2학기 삼성드림클래스 대학생멘토 (유형1 방문멘토링)',
  '삼성전자',
  '기업',
  ARRAY['학업장려금']::support_category[],
  '장학금 200만원 (활동 종료 후 일괄 지급), 활동인증서, 삼성 임직원 취업 멘토링, 취업·어학 관련 온라인 강좌 등',
  DATE '2026-05-14',
  DATE '2026-06-10',
  DATE '2026-07-15',
  ARRAY['재학', '휴학']::enrollment_status_type[],
  true,
  ARRAY['온라인 지원서 (자기소개·지원동기 등)', '재학(휴학)증명서', '본인 신분증']::text[],
  '온라인 (삼성드림클래스 공식 누리집)',
  'https://www.dreamclass.org',
  'https://www.dreamclass.org',
  '삼성드림클래스 사무국',
  E'[활동기간] 2026.09 ~ 2027.02 (6개월). [필수참석] 학기 중 매주 수요일 지정 선발기관 방문(2시간), 서울 대면면접, 7월 말 오프라인 정기연수(수원 1박 2일). 온라인 격주 1:1 멘토링 진행 필수. 전국 15개 시도 선발기관 배정(세종·제주 제외).',
  4,
  '서류접수',
  '2026-05-14 ~ 2026-06-10 10:00',
  '서류발표',
  '2026-06-17 14:00',
  '대면면접 (서울 삼성전자 서초사옥)',
  '2026-07-01 ~ 2026-07-03',
  '면접발표',
  '2026-07-15 14:00',
  DATE '2026-05-30',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '2026년 2학기 삼성드림클래스 대학생멘토 (유형1 방문멘토링)'
    AND s.organization = '삼성전자'
);
