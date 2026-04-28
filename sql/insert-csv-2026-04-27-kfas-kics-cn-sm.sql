-- CSV 장학금_DB(4) 140~143행 (KFAS-001, KICS-001, CN-001, SM-001)
-- 중복 방지: name + organization

SELECT setval(
  'public.scholarships_id_seq',
  (SELECT COALESCE(MAX(id), 1) FROM public.scholarships)
);

-- 1. KFAS-001 — 2026년 인재림 제6기 장학생
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_school_location, qual_school_category, qual_academic_year, qual_enrollment_status,
  qual_nationality, can_overlap, required_documents, apply_method, apply_url, homepage_url,
  contact, note,
  selection_stages, selection_stage_1, selection_stage_2, selection_stage_3,
  selection_stage_1_schedule, selection_stage_2_schedule, selection_stage_3_schedule, selection_note,
  collected_at, is_verified, list_on_home
)
SELECT
  '2026년 인재림 제6기 장학생',
  '한국고등교육재단 (KFAS)',
  '재단법인',
  ARRAY['학업장려금']::support_category[],
  8000000,
  '2026-04-20', '2026-05-11', '2026-07-22', 20,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[2::smallint, 3::smallint],
  ARRAY['재학', '휴학']::enrollment_status_type[],
  '내국인',
  true,
  ARRAY['지원서 및 에세이', '성적증명서', '교내외 활동 증빙자료']::text[],
  '온라인접수',
  'https://www.kfas.or.kr',
  'https://www.kfas.or.kr',
  '02-6310-7881',
  '1년간 커리큘럼 풀참여 가능자(어학연수, 교환학생, 취업, 군복무 등 예정자는 지원 불가). 지원규모: 800만원+활동비(기관 기준). 면접 7.16. 대면 필수.',
  3, '서류심사', '1차 면접', '최종발표',
  '2026-07-13', '2026-07-16', '2026-07-22',
  '면접심사(7.16) 대면 참석 필수',
  '2026-04-27'::date, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '2026년 인재림 제6기 장학생' AND organization = '한국고등교육재단 (KFAS)'
);

-- 2. KICS-001 — 2026 KICS 한국통신학회 장학금
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_major, qual_nationality, can_overlap, required_documents, apply_method, apply_url, homepage_url,
  note, selection_stages, selection_stage_1, selection_note,
  collected_at, is_verified, list_on_home
)
SELECT
  '2026 KICS 한국통신학회 장학금',
  '한국통신학회 (KICS)',
  '기타',
  ARRAY['학업장려금']::support_category[],
  1000000,
  '2026-04-16', '2026-05-14', 20,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '대학원']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['공학계열', 'ICT']::text[],
  '내국인',
  true,
  ARRAY['지원서', '성적증명서', '지도교수 또는 학과장 추천서']::text[],
  '온라인접수',
  'https://forms.gle/5tmehbjNqMaAL1MR6',
  'https://www.kics.or.kr/html/?pmode=BBBnotice&smode=view&seq=4839',
  'KICS 학생회원/정회원/온라인 회원 필수, 통신·전자·컴퓨터·소프트웨어 등 ICT 관련 학과. 정량 50%(학회 참여도 25%, 성적 25%) + 정성 50%(발전가능성 30%, 추천서 20%).',
  1, '서류심사',
  '종합평가(학업성적, 연구성과, 발전가능성)',
  '2026-04-27'::date, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '2026 KICS 한국통신학회 장학금' AND organization = '한국통신학회 (KICS)'
);

-- 3. CN-001 — 2026년 재능키움 장학사업
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_academic_year, qual_enrollment_status,
  qual_region, qual_nationality, can_overlap, required_documents, apply_method, apply_url, homepage_url,
  contact, note, selection_stages, selection_stage_1, selection_note,
  collected_at, is_verified, list_on_home
)
SELECT
  '2026년 재능키움 장학사업',
  '(재)충남평생교육진흥원',
  '지방자치단체',
  ARRAY['생활비']::support_category[],
  2000000,
  '2026-04-23', '2026-05-07', 75,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY[2::smallint, 3::smallint, 4::smallint],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['충남']::text[],
  '내국인',
  false,
  ARRAY[
    '장학생 신청서',
    '자기소개 및 진로계획서',
    '주민등록초본',
    '재학증명서(수강확인서)',
    '성적증명서'
  ]::text[],
  '온라인접수',
  'https://www.clehrd.or.kr',
  'https://www.clehrd.or.kr',
  '041-635-1270',
  '신청자 또는 부모 충남 1년 이상 거주, 직전학기 8학점 이상. 학점은행제 등은 공고 확인. 2025년 당해 장학금 수혜자·당해연도 진흥원 내 타 장학과 중복 불가. 평가: 학업 50% + 서류(에세이 40%, 봉사 10%).',
  1, '서류심사',
  '정량/정성 종합평가',
  '2026-04-27'::date, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '2026년 재능키움 장학사업' AND organization = '(재)충남평생교육진흥원'
);

-- 4. SM-001 — 2026년 서울독립유공자후손장학금
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_academic_year, qual_enrollment_status,
  qual_region, qual_nationality, can_overlap, required_documents, apply_method, apply_url, homepage_url,
  contact, note, selection_stages, selection_stage_1, selection_note,
  collected_at, is_verified, list_on_home
)
SELECT
  '2026년 서울독립유공자후손장학금 (서울 소재 대학 재학)',
  '(재)서울미래인재재단',
  '지방자치단체',
  ARRAY['학업장려금']::support_category[],
  3000000,
  '2026-04-23', '2026-05-06', 120,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY[1::smallint, 2::smallint, 3::smallint, 4::smallint],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['서울']::text[],
  '내국인',
  true,
  ARRAY[
    '지원서',
    '자기소개서',
    '독립유공자 유족확인원',
    '가족관계증명서',
    '재학증명서',
    '성적증명서',
    '경제상황증빙서류(선택)'
  ]::text[],
  '온라인접수(PC권장)',
  'https://www.hissf.or.kr',
  'https://www.hissf.or.kr',
  '02-725-2257',
  '독립유공자(순국선열·애국지사) 4~6대 후손. 참전유공자 등 기타 보훈대상·정규 마지막 학기 재학은 제외. 가구당 1인. 경제상황 미제출 시 소득 점수 최하. 재단 내 타 학업장려성 장학과는 중복 불가.',
  1, '서류심사',
  '종합평가 진행',
  '2026-04-27'::date, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '2026년 서울독립유공자후손장학금 (서울 소재 대학 재학)'
    AND organization = '(재)서울미래인재재단'
);
