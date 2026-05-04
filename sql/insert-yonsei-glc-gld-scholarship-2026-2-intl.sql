-- 연세대학교 GLC(GLD 자유장학금, 외국인) — 2026-2학기
--
-- • enrollment 에 「복학」 없음 → qual_enrollment_status 는 재학만 보장, 복학 설명은 qual_special_info
-- • 직전학기 평점 2.5 → qual_gpa_last_semester_min (qual_gpa_min 아님)

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
  qual_university,
  qual_school_location,
  qual_school_category,
  qual_enrollment_status,
  qual_major,
  qual_nationality,
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
  selection_stage_1_schedule,
  selection_stage_2_schedule,
  selection_stage_3_schedule,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026-2학기 GLD 자유장학금 (외국인)',
  '연세대학교 글로벌인재학부(GLC)',
  '학교',
  ARRAY['등록금']::support_category[],
  0,
  '2026-2학기 등록금 선감면(등록금 초과 불가·교내 규정 및 공고 확인)',
  DATE '2026-05-18',
  DATE '2026-06-19',
  DATE '2026-07-31',
  ARRAY['연세대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY[
    '글로벌인재학부',
    '글로벌인재학부(GLC)',
    'GLD',
    'GLC'
  ],
  '외국인'::nationality_type,
  NULL,
  2.5,
  true,
  ARRAY[
    '복학생 포함 — 학적 상태가 재학이어야 하며, 공고에 따라 휴학·졸업·학기 초과 학생 불가',
    '직전학기 12학점 이상 이수',
    '지도교수 면담 사전 완료 필수(포털 신청, 2026-05-11~06-12)',
    'TOPIK / SKA / KLI 등 공고별 어학 성적 요건 충족자'
  ]::text[],
  ARRAY[
    '자유장학금 신청 사유서(지도교수 서명 필수)',
    '어학성적표(TOPIK 등)',
    '가족관계증명서',
    '소득 증빙 서류(부모 모두)',
    '[선택] 재산/부채 증빙서류 등'
  ],
  '구글폼 온라인 서류 제출 · 지도교수 면담은 포털 신청(공고·학부 안내)',
  '',
  NULL,
  'glc@yonsei.ac.kr',
  $n$
지도교수 면담 시 사유서 서명 날인 필수. 소득 서류 공증 필요. 모든 서류는 한글/영문 원본 또는 번역 원칙 준수(공고 확인).
$n$,
  3,
  '사전 지도교수 면담',
  '구글폼 등 서류 제출',
  '최종 발표',
  '일정 및 제출처는 학부 최신 공지를 우선 확인하세요.',
  '2026-05-11 ~ 2026-06-12',
  '2026-05-18 ~ 2026-06-19',
  '2026-07-31 발표 예정',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '연세대학교 글로벌인재학부(GLC)'
    AND s.name = '2026-2학기 GLD 자유장학금 (외국인)'
);
