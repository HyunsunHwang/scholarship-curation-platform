-- 2026년 KB Dream Wave 2030 KB라스쿨 중등 4기 대학생 멘토 모집 — KB국민은행·아이들과미래재단
-- 매핑 메모:
-- • institution_type 원문 '기업/재단' → 주관 KB국민은행 기준 `기업`, 공동 주관은 organization 문자열에 유지
-- • support_types 원문 '장학금' → enum `학업장려금`
-- • qual_nationality 원문 '대한민국' → enum `내국인`
-- • qual_enrollment_status 원문 '재학생·휴학생' → enum `재학`, `휴학`
-- • apply_start_date·apply_url·selection_count: 원문 미기재 → NULL / 빈 문자열 / NULL
-- • can_overlap 원문 NULL → 보수적 기본 false

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
  qual_major,
  qual_region,
  qual_nationality,
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
  selection_stage_1_schedule,
  selection_stage_2,
  selection_stage_2_schedule,
  selection_stage_3,
  selection_stage_3_schedule,
  selection_note,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026년 KB Dream Wave 2030 KB라스쿨 중등 4기 대학생 멘토 모집',
  'KB국민은행 (아이들과미래재단)',
  '기업',
  ARRAY['학업장려금']::support_category[],
  '수료 장학금 200만원 지원 (금융 소외계층 장학금 추가 지원)',
  NULL,
  DATE '2026-06-17',
  DATE '2026-07-21',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ARRAY['재학', '휴학']::enrollment_status_type[],
  NULL,
  NULL,
  '내국인',
  ARRAY[
    '활동기간 내 대학생 신분 유지자',
    '중등 전학년 학습지도(최소 중3) 및 고입전략/내신대비 조언 가능자',
    '8개월 동안 주 1회 이상 지속 활동 가능자',
    '소외계층 우선 선발',
    '대학원생 불가',
    '전국 4년제 일반 대학교 재학(휴학)생 (교육·AI 관련 학과 우대, 지방 거주 멘토 우선 선발)',
    '학기 중 교환학생·인턴십 등 참여 예정자 지원 불가'
  ]::text[],
  false,
  ARRAY[
    '온라인 신청서',
    '고등학교 생활기록부',
    '대외활동 이력 증빙(선택)'
  ]::text[],
  '온라인 (KB라스쿨 중등 홈페이지)',
  '',
  NULL,
  '02-365-8463 / http://ovxl9.channel.io',
  E'[접수] 마감 2026-06-17 11:00.\n'
  || E'[활동내용] 1:2 맞춤 학습 멘토링(블렌디드, 총 56회 이상), 문화체험활동 지원, 역량강화 교육, 팀리더/서포터즈 운영.\n'
  || E'[지원혜택] 수료 장학금, 멘토링 활동비, 역량강화교육 지원 등.\n'
  || E'[필수참석] 발대식(7.29) 및 OT(8.5).\n'
  || E'[제출] 고등학교 생활기록부 제출 시 주민등록번호 모자이크 처리 필수.',
  3,
  '1차 합격자 발표',
  '2026-06-25',
  '2차 최종 면접 심사 (비대면)',
  '2026-07-01 ~ 2026-07-07',
  '최종발표',
  '2026-07-21',
  '발대식(7/29) 및 OT(8/5) 불참 시 선정 취소',
  DATE '2026-06-05',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '2026년 KB Dream Wave 2030 KB라스쿨 중등 4기 대학생 멘토 모집'
    AND s.organization = 'KB국민은행 (아이들과미래재단)'
);
