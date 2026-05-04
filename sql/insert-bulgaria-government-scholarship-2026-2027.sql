-- 주한불가리아대사관 등 — 2026-2027 불가리아 정부초청 장학생 선발
-- support_category 에 기숙사 라벨 없음 → 「기숙사 제공」은 기타
-- qual_degree_level 컬럼 없음 · 한국국적 문자열 매칭 → qual_nationality = 내국인 + qual_special_info

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
  selection_note,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026-2027 불가리아 정부초청 장학생 선발',
  '불가리아 정부 / 주한불가리아대사관',
  '정부/공공기관',
  ARRAY['등록금', '생활비', '기타']::support_category[],
  0,
  '수업료 면제, 기숙사 제공, 장학금(생활비성) 지급 — 원본 안내 참조',
  NULL,
  DATE '2026-09-01',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  '내국인'::nationality_type,
  false,
  ARRAY[
    '대한민국 국적자 한정',
    '불가리아 소재 대학 학사·석사·박사 학위 과정 지원 공고 해당자(연령·전공 등은 모집요강 첨부 참조)'
  ]::text[],
  ARRAY[
    '첨부파일 모집요강 참조 — 원본에 명시된 제출 목록 우선 준수'
  ],
  '우편 제출 — 원본 서류 주한불가리아대사관 우편 접수(유선 불가 가능, 공고 확인)',
  '',
  NULL,
  'embassy.seoul@mfa.bg',
  $n$
제출처: 서울시 용산구 한남대로 102-8 (우편번호 04418) 주한불가리아대사관. 유선문의 불가로 안내될 수 있습니다 — 공고 또는 이메일로 확인하세요.
$n$,
  1,
  '선발 검토 및 대사관 제출 처리',
  '실제 접수 증빙·일정 변경은 모집요강 및 대사관 최신 공지를 우선 확인하세요.',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '불가리아 정부 / 주한불가리아대사관'
    AND s.name = '2026-2027 불가리아 정부초청 장학생 선발'
);
