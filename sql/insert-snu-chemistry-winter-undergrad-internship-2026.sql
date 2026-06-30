-- 서울대학교 자연과학대학(화학부) — 2026학년도 동계 자연과학대학(화학부) 학부생 연구 인턴십
--
-- 매핑 메모:
-- • institution_type 「학교」→ DB enum은 `대학교`
-- • support_category 「연구비」→ 현재 ENUM에 연구비 없음 → 프로그램 성격 반영하여 `학업장려금` + `기타`
-- • qual_major: 타대 신청 가능 및 세부 학과 불명확 시 매칭 오매칭 방지 위해 NULL · 화학·연구실 조건 등은 qual_special_info
-- • 졸업예정(학점 이수 중) 가능은 매칭 포함을 위해 enrollment에 졸업예정 포함 (원문 CSV는 재학만 명시, 비고 확장)

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
  selection_note,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026학년도 동계 자연과학대학(화학부) 학부생 연구 인턴십',
  '서울대학교 자연과학대학 (화학부)',
  '대학교',
  ARRAY['학업장려금', '기타']::support_category[],
  '일반: 100만 원(소득세 포함) / LX Science Fellowship(서울대 자연대 소속 한정): 150만 원 — 연수 종료 후 수료요건 충족자 일괄 지급',
  NULL,
  DATE '2026-05-14',
  DATE '2026-05-28',
  NULL,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[2, 3, 4],
  ARRAY['재학', '졸업예정']::enrollment_status_type[],
  NULL,
  NULL,
  false,
  ARRAY[
    '전일제 학생만 참여 가능(건강보험자격득실확인서상 근로자인 경우 주 10시간 미만 근로만 가능)',
    '서울대 화학부 지도교수 사전 컨택 및 추천서 필수',
    '2개 이상 연구실 중복 신청 불가',
    '2026년 1학기 학부 재학 중인 2~4학년 또는 초과이수학기생; 학점 미이수 졸업예정자 포함. 1학년 지원 불가. 휴학생·졸업생은 후순위 선발 가능(공고 기준)',
    '서울대 및 타 대학 학부생 지원 가능(타대생·다전공은 성적·재학 증명 등 추가 서류 확인)',
    '기초교육원 주관 학부생 연구지원사업·상반기/하계 인턴십 등 타 사업과 중복 불가',
    '인권·성평등 및 안전환경 교육 이수 필수',
    '결과보고서 미제출 시 지원금 전액 환수'
  ]::text[],
  ARRAY[
    '참여 신청 및 추천서',
    '개인정보 수집 동의서',
    '보안서약서',
    '건강보험자격득실확인서',
    '통장사본',
    '(타대생/다전공생) 성적증명서, 재학증명서 등 소속별 필수 서류'
  ],
  '구글 폼 제출(온라인) 또는 화학부 행정실 방문 제출 — 구비 서류 스캔본 업로드(공고 기준)',
  '',
  'https://chem.snu.ac.kr',
  '구은회 (02-880-6668 / Keh0215@snu.ac.kr)',
  $n$
연수기간: 2026. 6. 15. ~ 2026. 8. 7.(8주). 원서 마감: 2026-05-14 23:30(당일 접수 시간은 공지 확인).
선발 결과: 2026-05-28(목) 이내 문자 통보. 구글폼 링크·제출처는 화학부 공지를 확인하세요.
$n$,
  2,
  '서류 심사(추천서·증빙)',
  '선발 결과 통보 및 연수 진행 안내',
  '선발 절차·일정 변경은 학과 공고를 우선 확인하세요.',
  CURRENT_DATE,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '서울대학교 자연과학대학 (화학부)'
    AND s.name = '2026학년도 동계 자연과학대학(화학부) 학부생 연구 인턴십'
);
