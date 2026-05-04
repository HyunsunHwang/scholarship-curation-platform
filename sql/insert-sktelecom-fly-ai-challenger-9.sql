-- SK텔레콤 FLY AI Challenger 9기
-- 중복 방지: organization + name
-- support_category에 '교육' 라벨 없음 → 교육(훈련) 무상 안내는 '기타', 수료 장학은 '생활비'
-- 재직 불가 등은 프로필에 employment 컬럼이 없어 qual_special_info(자유 텍스트)로 기록

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
  qual_school_category,
  -- 학년 게이트: 4년제 3학년 vs 전문대 2학년을 한 컬럼으로 표현 불가하여
  -- qual_special_info 에만 명시하고 RPC 오매칭(전문대 2학년 배제 등) 방지
  qual_min_academic_year,
  qual_min_academic_semester,
  qual_enrollment_status,
  qual_major,
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
  'SK텔레콤 FLY AI Challenger 9기',
  'SK텔레콤',
  '기업',
  ARRAY['기타', '생활비']::support_category[],
  0,
  '교육 전액 무상, 수료 장학금 지급, 자격증 응시료 지원',
  DATE '2026-04-27',
  DATE '2026-05-20',
  DATE '2026-06-05',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ARRAY[
    '재학',
    '휴학',
    '수료',
    '졸업예정',
    '졸업'
  ]::enrollment_status_type[],
  NULL,
  false,
  ARRAY[
    '미취업자 요건 — 재직자·자영업자 지원 불가',
    '국민내일배움카드 소지 또는 발급 가능자',
    '전체 교육 기간(6.22~8.31) 통학 가능자 (숙소 미제공)',
    '4년제 기준 3학년 이상, 전문대는 2학년 이상(공고 기준 학력 요건)'
  ]::text[],
  ARRAY['온라인 지원서'],
  '온라인 신청',
  'https://www.skthechacademy.com',
  'https://www.skthechacademy.com',
  'SKT-KDP@sk.com / 02-6100-3746, 4437 — 국민내일배움카드 문의는 대한상공회의소',
  $$
[채용 혜택] 우수 교육생 SK텔레콤(SW개발) 및 SK브로드밴드(AI/DT) 신입 채용 지원 시 우대. 전형: 서류 → 5/30(토) 면접·코딩역량평가 → 6/5 최종 합격 발표.
$$,
  3,
  '서류 전형',
  '일반면접 및 코딩역량평가',
  '최종 합격',
  '선발 과정 및 일정은 주최처 공고·사이트를 최종 확인하세요.',
  '2026-05-30(토) 면접 및 코딩역량평가 예정',
  '2026-06-05 최종 합격자 발표(공고 일정)',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = 'SK텔레콤'
    AND s.name = 'SK텔레콤 FLY AI Challenger 9기'
);
