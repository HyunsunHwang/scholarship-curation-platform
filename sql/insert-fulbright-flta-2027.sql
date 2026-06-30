-- 한미교육위원단 — 2027학년도 풀브라이트 한국어 보조강사(FLTA) 프로그램
--
-- 매핑 메모:
-- • support_category: 원문 「학비」→ 등록금 · 「항공권」등 세부 → 기타 보조
-- • qual_nationality: DB는 내국인/외국인만 → 대한민국 국적 요건은 내국인 + qual_special_info
-- • qual_language 컬럼 없음 → TOEFL/IELTS 조건은 qual_special_info에 명시
-- • qual_major: 우대 전공만 공고에 있음 → 매칭 엔진이 비어 있지 않으면 필터로 동작하므로 NULL 처리, 내용은 qual_special_info에 유지
-- • institution_type: Fulbright Korea → 재단법인

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
  selection_stage_2,
  selection_stage_3,
  selection_note,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2027학년도 풀브라이트 한국어 보조강사(FLTA) 장학생',
  '한미교육위원단 (Fulbright Korea)',
  '재단법인',
  ARRAY['생활비', '등록금', '해외연수비', '기타']::support_category[],
  '생활비, Non-Degree 학비(학기당 2개 강좌), 미국무성 의료보험, 왕복 국제항공권, 수하물 비용 지원',
  DATE '2026-08-03',
  DATE '2026-08-28',
  NULL,
  NULL,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['졸업', '졸업예정']::enrollment_status_type[],
  NULL,
  '내국인'::nationality_type,
  false,
  ARRAY[
    '2027년 2월까지 최소 한국어 교원 양성과정(120시간 이상) 이수 또는 관련 학위 취득(수료) 필수',
    '2027년 4월 ~ 8월까지 한국 거주 필수',
    'TOEFL iBT 79점 이상(Best Score 불인정) 또는 IELTS Academic 6.0 이상 필수',
    '미국 이중국적자 및 영주권자 지원 불가 · 대한민국 국적 요건 준수',
    '우대(비필수) 전공 · TESOL/교직: 교육학, 언어학, 국어국문, 국어교육, 영어영문, 영어교육, 한국학, 한국어교육 등 공고 기준',
    '한국어 교원 자격증/수료증 필수 지원 마감 시점 규정은 공고 확인(면접 합격 후 제출 가능 여부 포함)',
    '일반 재학생 단독 지원 불가 — 기 졸업자 또는 2027년 2월 졸업예정자'
  ]::text[],
  ARRAY[
    '온라인 지원서 2종',
    '영문 성적증명서',
    '영문 재학/졸업증명서',
    'TOEFL 또는 IELTS 성적표',
    '영문 추천서 3부',
    '기타 홈페이지 명시 서류'
  ],
  '온라인 접수 + 우편 접수 (병행 필수)',
  'https://www.fulbright.or.kr/grant/flta/',
  'https://www.fulbright.or.kr/grant/flta/',
  'application@fulbright.or.kr / 02-3275-4027',
  $sn$
원서 접수는 2026-08-28 17:00 마감(공고 확인). 우편은 원서 제출 기간 내 소인 유효. 온라인 지원서는 5월부터 작성 가능 안내가 있을 수 있으나 제출 마감·필수 병행 절차는 공식 페이지를 우선 확인하세요.
파견: 2027년 가을학기부터 미국 대학교 약 9개월 간 한국어 강의 보조 및 비학위(Non-degree) 과정 수강.
$sn$,
  3,
  '서류 심사 및 추천서 검토',
  '면접',
  '최종 선발',
  '전형 세부 일정·합격 발표 등은 한미교육위원단 공식 안내(FLTA 프로그램)를 확인하세요.',
  CURRENT_DATE,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '한미교육위원단 (Fulbright Korea)'
    AND s.name = '2027학년도 풀브라이트 한국어 보조강사(FLTA) 장학생'
);
