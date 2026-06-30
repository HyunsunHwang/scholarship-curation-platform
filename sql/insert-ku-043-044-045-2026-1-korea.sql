-- KU-043, KU-044(기존 id 보정), KU-045 — 고려대 2026학년도 1학기 (2026-04-29 기준)
-- 중복 방지: name + organization

-- KU-044: 성재(誠齋) — 기존 행 오기(誐) 교정 및 공고 반영
UPDATE public.scholarships
SET
  name = '2026학년도 1학기 글로벌한국융합학부 성재(誠齋)장학금',
  apply_start_date = '2026-04-01',
  apply_end_date = '2026-05-11',
  announcement_date = NULL,
  selection_count = NULL,
  qual_school_location = ARRAY['국내 대학']::school_location_type[],
  qual_school_category = ARRAY['4년제']::school_category_type[],
  qual_enrollment_status = ARRAY['신입생', '재학']::enrollment_status_type[],
  qual_major = ARRAY['글로벌한국융합학부'],
  qual_gpa_min = 3.5,
  qual_gpa_last_semester_min = 3.5,
  qual_nationality = '외국인',
  can_overlap = false,
  required_documents = ARRAY[
    '장학금 신청서',
    '한국어능력 증명서',
    '성적증명서(재학생)',
    '국문 자기소개서(글로벌한국학 관련 활동 포함)',
    '학부장 또는 지도교수 추천서'
  ],
  apply_method = '행정실 직접 제출 또는 이메일(dis@korea.ac.kr) / 제목: [성재장학금지원] 학번, 이름 / 모든 서류 PDF 1개로 합본',
  apply_url = 'https://dis.korea.ac.kr',
  homepage_url = 'https://dis.korea.ac.kr',
  contact = 'dis@korea.ac.kr (글로벌한국융합학부 행정실)',
  support_amount = 0,
  support_amount_text = '장학금액·선발인원 공고 미기재 (학부 문의)',
  note = 'TOPIK 5급 이상 가산점. 연속 지원 시 한국어 능력 향상 증명 필요. 학사징계 전력자 결격. 신입생은 직전학기 학점·이수학점 기준 미적용. 9학기 미만 재학생·신입생 대상(초과학기 불가). 소득·가구 제한 공고 미기재.',
  selection_stages = 1,
  selection_stage_1 = '서류심사',
  selection_stage_2 = NULL,
  selection_stage_3 = NULL,
  selection_note = '학점·이수학점·한국어능력·추천서 종합 평가. TOPIK 5급 이상 가산점.',
  selection_stage_1_schedule = '2026-05-11까지(행정실 또는 이메일)',
  selection_stage_2_schedule = NULL,
  selection_stage_3_schedule = NULL,
  collected_at = '2026-04-29',
  is_verified = true,
  list_on_home = false,
  updated_at = now()
WHERE organization = '고려대학교 글로벌한국융합학부'
  AND name IN (
    '2026학년도 1학기 글로벌한국융합학부 성재(誠齋)장학금',
    '2026학년도 1학기 글로벌한국융합학부 성재(誐齋)장학금'
  );

-- KU-043: 노어노문학과 정경택 교우 장학금
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university, qual_school_location, qual_school_category,
  qual_enrollment_status, qual_major, qual_gpa_min, qual_gpa_last_semester_min,
  qual_nationality, can_overlap,
  required_documents, apply_method, apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1, selection_stage_2,
  selection_stage_1_schedule, selection_stage_2_schedule, selection_note,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026학년도 1학기 노어노문학과 정경택 교우 장학금',
  '고려대학교 노어노문학과',
  '대학교',
  ARRAY['생활비']::support_category[],
  1000000,
  '100만원',
  '2026-04-20',
  '2026-04-30',
  NULL,
  2,
  ARRAY['고려대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['노어노문학과', '노어노문'],
  NULL,
  4.5,
  '내국인',
  true,
  ARRAY[
    '장학금 신청 사유서(붙임 양식, 1쪽 이내, 11pt)',
    '성적증명서',
    '학자금 지원구간 통지서(국가장학금 신청자)'
  ],
  '이메일 제출 (lib012@korea.ac.kr) / 제목: [정경택 장학금 신청] 학번 이름',
  'https://russian.korea.ac.kr',
  'https://russian.korea.ac.kr',
  'lib012@korea.ac.kr (노어노문학과)',
  '국가장학금 신청자(필수). 성적우수상: 총장상(두 학기 연속 평점평균 4.5 이상) 또는 학장상(해당 학기 4.5 이상)이며 해당 학기 17학점 이상 이수. 제1전공 노어노문학과. 수업연한 8학기 이내(초과학기 불가). 장학증서 수여식 참석 필수. 국가장학금·면학장학금만 중복 가능, 그 외 교내외 장학금 수혜자는 제외. 장학금 총액이 수업료를 초과하는 경우 생활비 장학금으로 지급될 수 있음.',
  2,
  '서류심사',
  '최종발표(개별통보)',
  '2026-04-30 17:00까지(이메일)',
  '추후 개별 통보',
  '성적우수상 수상(신청요건) 및 가계 현황 종합 평가. 장학금 총액이 수업료 미초과인 자 우선.',
  '2026-04-29',
  true,
  false,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships s
  WHERE s.organization = '고려대학교 노어노문학과'
    AND s.name = '2026학년도 1학기 노어노문학과 정경택 교우 장학금'
);

-- KU-045: 보건과학대학 멘토 근로장학금
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university, qual_school_location, qual_school_category,
  qual_min_academic_year, qual_enrollment_status, qual_major,
  qual_nationality, can_overlap,
  required_documents, apply_method, apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1,
  selection_stage_1_schedule, selection_note,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026학년도 1학기 보건과학대학 외국인 재학생 멘토링 프로그램 멘토 근로장학금',
  '고려대학교 보건과학대학',
  '대학교',
  ARRAY['생활비']::support_category[],
  0,
  '근로장학금(지급액·시간 기준 학부 별도 안내)',
  '2026-04-01',
  '2026-05-05',
  NULL,
  NULL,
  ARRAY['고려대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  2,
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['바이오시스템의과학부', '바이오의공학부', '바이오시스템의과', '바이오의공'],
  '내국인',
  false,
  ARRAY['신청서', '개인정보 활용 동의서(첨부 양식)'],
  '이메일 제출 (jw5864@korea.ac.kr)',
  'https://chs.korea.ac.kr/search/search_view.html?fd=notice&no=2390&page=1&key=%EC%9E%A5%ED%95%99',
  'https://chs.korea.ac.kr',
  'jw5864@korea.ac.kr / 02-3290-5670',
  '외국인 재학생 멘티를 돕는 멘토 근로장학금입니다. 한 학기 약 6주 멘토 활동 후 활동 시간에 따라 학기 말 계좌 지급(등록금 공제 아님). 제2외국어(중국어 등) 가능 시 지원서에 기재. 같은 전공끼리 우선 매칭.',
  1,
  '서류심사',
  '2026-05-05까지(이메일)',
  '근로 부서·금액·시간 등 세부사항은 보건과학대학 공지 확인',
  '2026-04-29',
  true,
  false,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships s
  WHERE s.organization = '고려대학교 보건과학대학'
    AND s.name = '2026학년도 1학기 보건과학대학 외국인 재학생 멘토링 프로그램 멘토 근로장학금'
);
