-- 2026년 4차산업 인재육성 장학생 — (재)아산시미래장학회
-- institution_type 원문 「공공/지자체 재단」→ `재단법인`
-- 접수처 URL 없음 → apply_url 에 mailto 처리

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_major,
  qual_region,
  qual_special_info,
  can_overlap,
  required_documents, apply_method,
  apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026년 4차산업 인재육성 장학생',
  '(재)아산시미래장학회',
  '재단법인',
  ARRAY['학업장려금', '생활비']::support_category[],
  2000000,
  '총 200만원 (1차 100만원, 11~12월 결과보고회 심사 후 2차 100만원 분할 지급)',
  '2026-05-11',
  '2026-05-15',
  NULL,
  15,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY[
    '이공계열',
    '컴퓨터/소프트웨어',
    '전자공학',
    '기계공학',
    '신소재공학',
    '생명공학'
  ]::text[],
  ARRAY['아산시']::text[],
  ARRAY[
    '공고일 기준 본인 또는 부모가 아산시에 2년 이상 계속 주민등록 및 거주',
    '4차산업 분야 전공자 (단순 취미 배제)',
    '1가구 1인 지원 제한'
  ]::text[],
  true,
  ARRAY['구비서류 일체 (세부 목록은 모집요강 참조)']::text[],
  '이메일 접수 (asanmirae1@daum.net)',
  'mailto:asanmirae1@daum.net',
  NULL,
  'asanmirae1@daum.net',
  E'중복 수혜: 2026년 본 회(아산시미래장학회)의 타 장학금과 중복 수혜 불가(공고문).\n'
  || E'22~25년도 동일 사업 수혜자는 지원 불가.\n'
  || E'이메일 수신 시간이 접수 기준이며(마감 18:00), 서류 보완이 있을 수 있어 조기 신청 권장.\n'
  || E'2차 장학금(100만원)은 결과보고회 평가 미달 시 미지급일 수 있음.\n'
  || E'대학 형태: 4년제·전문대 등(원격대학·평생교육시설·학점은행제 등 제외 공고 참고).\n'
  || E'휴학생 및 수료(졸업유예 등) 상태는 신청 불가(공고문).',
  1,
  '서류심사 및 결과보고회(2차 지급)',
  '2026-05-03',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '(재)아산시미래장학회'
    AND s.name = '2026년 4차산업 인재육성 장학생'
);
