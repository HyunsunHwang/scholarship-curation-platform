-- 2026년 1학기 안산시 대학생 본인부담 등록금 반값 지원 — 안산시·(재)안산인재육성재단
-- institution_type 「공공/지자체 재단」→ `재단법인`
-- qual_gpa_min: 원문은 「직전학기 백분위 60점」이며 프로필은 4.5 만점 학점이라 자동 매칭 불가 → NULL 후 note·설명 참고

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_age_max,
  qual_gpa_min, qual_gpa_last_semester_min,
  qual_income_level_max,
  qual_region,
  qual_special_info,
  can_overlap,
  required_documents, apply_method,
  apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026년 1학기 안산시 대학생 본인부담 등록금 반값 지원',
  '안산시·(재)안산인재육성재단',
  '재단법인',
  ARRAY['등록금']::support_category[],
  1000000,
  '본인부담 등록금의 50% 지원 (학기당 최대 100만 원, 연간 200만 원 한도)',
  '2026-05-06',
  '2026-06-05',
  '2026-07-10',
  NULL,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  29,
  NULL,
  NULL,
  6,
  ARRAY['안산시']::text[],
  ARRAY[
    '공고일 기준 안산시에 3년 이상 계속 거주 또는 합산 10년 이상 주민등록을 둔 자',
    '2026-1학기 한국장학재단 국가장학금 사전 신청 필수',
    '직전학기 12학점 이상 이수 (졸업학기 학생은 학점 이수 기준 예외)'
  ]::text[],
  true,
  ARRAY[
    '본인부담 등록금 반값 지원신청서 및 개인정보 동의서',
    '학자금 대출 장학금 신청증명서',
    '가족관계증명서',
    '통장사본',
    '학자금 지원구간 통지서(해당자)',
    '직전학기 성적증명서(해당자)'
  ]::text[],
  '온라인(누리집), 우편(등기), 방문 접수',
  'https://ansanfys.or.kr',
  'https://ansanfys.or.kr',
  '031-414-0924 / 031-369-1628 (안산인재육성재단·안산시 교육청소년과)',
  E'연령·출생일: 만 29세 이하(공고 연도 기준 등 상세 요건 및 1997. 1. 1. 이후 출생은 공고문 확인).\n'
  || E'대학: 국내 대학(공고 명시 교명·전문대·한호전 등), 대학원·외국대학·교육훈련기관·학점은행제 제외(공고문).\n'
  || E'성적: 직전학기 백분위 성적 60점(D학점) 이상 — 프로필 4.5 만점 학점과 스케일이 달라 맞춤 추천은 참고만 하며, 신입생·편입·재입학·장애인 학생의 첫 학기는 성적기준 미적용(공고문).\n'
  || E'소득: 소득분위 1~6 또는 국민기초·차상위·법정한부모 해당 등(통지서·공고 참고).\n'
  || E'전액 장학금 수혜자·(재)안산인재육성재단 연 200만 원 이상 타 장학 수혜자는 지원 제외. 실제 본인부담 등록금이 남아 있어야 중복 지원 가능(공고문).\n'
  || E'접수: 온라인은 마감일 18:00까지, 우편은 마감일 소인분까지 인정(공고문).\n'
  || E'서류: 공고 이후 발급분 위주 공고 확인(비고 참고).\n'
  || E'우선 선발 등: 다자녀(3자녀 이상) 가정, 장애인, 저소득층 등 공고 참고.',
  1,
  '서류심사',
  '2026-05-03',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '안산시·(재)안산인재육성재단'
    AND s.name = '2026년 1학기 안산시 대학생 본인부담 등록금 반값 지원'
);
