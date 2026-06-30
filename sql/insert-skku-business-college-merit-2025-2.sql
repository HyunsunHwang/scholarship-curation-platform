-- 2025-2학기 경영대학 성적우수장학금 — 성균관대학교 경영대학
-- 매핑 메모:
-- - support_types: 학비감면 → 등록금
-- - 금액: 등록금 한도 내 감면 → support_amount_text 0 + support_amount_text
-- - 공고명 [중요] 신청 제로 → apply_method·note에 자동 선발(무신청) 우선 반영(GLS 문구는 참고용 병기)
-- - enrollment enum에 「복학예정」없으면 재학만 저장, 복학예정·무료복학·초과등록은 qual_special_info
-- - 일정 미제공 → 2025-2학기 직전·등록 연계 대표 구간(보수적·참고용)

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
  qual_gpa_last_semester_min,
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
  '2025-2학기 경영대학 성적우수장학금',
  '성균관대학교 경영대학',
  '대학교',
  ARRAY['등록금']::support_category[],
  '등록금 범위 내 감면(고지 원칙). 등록금성 장학 합산 시 등록금 한도 내.',
  DATE '2025-07-01',
  DATE '2025-09-30',
  NULL,
  NULL,
  ARRAY['성균관대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['경영대학'],
  2.0,
  ARRAY[
    '직전학기 12학점 이상 이수(막학기 9학점)',
    '직전학기 과락(F) 없음',
    '복학예정자 포함(단, 무료복학자 제외 — 공고 기준)',
    '초과등록생은 전액 납부자만 가능',
    '[중요] 신청 제로(무신청)로 선발 — 과거 안내: GLS 신청/자격관리 > 장학금 신청(현행은 공고·학사 확인)'
  ]::text[],
  true,
  ARRAY[]::text[],
  '자동 선발(신청 제로·[중요] 변경). 참고: 과거 온라인(GLS 장학금 신청 메뉴) 안내 있었음 — 현행 절차는 공고 확인',
  '',
  'https://www.skku.edu/',
  NULL,
  E'[중요] 신청 제로로 변경(무신청·자동 선발). '
  || E'수혜 확정 후 휴학 시 장학금 자동 취소(이월 불가). 등록금 납부 후 선발 시 계좌 입금(공고 기준).\n'
  || E'apply_start/end는 2025-2학기 전후·등록 연계를 가정한 대표값이며 실제 일정은 당시 공고를 확인할 것.',
  1,
  '성적 기준 자동 산출',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '성균관대학교 경영대학'
    AND s.name = '2025-2학기 경영대학 성적우수장학금'
);
