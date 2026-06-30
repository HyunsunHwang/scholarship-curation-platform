-- 한국농어촌희망재단 — 2026 KRA지역돌봄 (대학생 봉사자 연계 지역돌봄 지원사업)
-- institution_type 원문 「재단」→ `재단법인`
-- support_types 원문 비어 있음 → 장학금 지급 사업이므로 `학업장려금`
-- CSV qual_gpa_last_semester_min 「80」은 학점 요건 오기입 → qual_special_info에 「직전학기 12학점 이상」 반영

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
  qual_nationality,
  qual_school_location,
  qual_school_category,
  qual_enrollment_status,
  qual_min_academic_year,
  qual_region,
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
  '2026 KRA지역돌봄 (대학생 봉사자 연계 지역돌봄 지원사업)',
  '한국농어촌희망재단',
  '재단법인',
  ARRAY['학업장려금']::support_category[],
  '130만원 (2026년 9월 지급, 2학기 재학 유지 필수)',
  DATE '2026-05-27',
  DATE '2026-06-02',
  NULL,
  26,
  '내국인',
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  2,
  ARRAY['서울', '경기']::text[],
  ARRAY[
    '서울·경기지역 소재 대학 재학생(2학기 재학 예정자)',
    '직전학기 12학점 이상',
    '[제외] 신입생(1학년 1학기), 졸업예정·수료자',
    '[제외] 재정지원 제한대학',
    '여름방학 중 경기도 내 지역아동센터 100시간 자원봉사(직접 섭외) 및 사전교육(오프라인 5시간) 필수'
  ]::text[],
  false,
  ARRAY[
    '성적증명서',
    '봉사활동 계획서',
    '동의서 및 이수 확약서'
  ]::text[],
  '재단 홈페이지 온라인 신청',
  'http://www.rhof.or.kr',
  'http://www.rhof.or.kr',
  NULL,
  E'장학금 2026년 9월 지급(2학기 재학 유지 필수). 사전교육(오프라인 5시간) 필수.\n'
  || E'여름방학 중 경기도 내 지역아동센터 100시간 자원봉사 필수(직접 섭외). 전공/교과 실습 대체 및 타 봉사 중복 불가. 재정지원 제한대학 불가.',
  1,
  '서류심사',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '한국농어촌희망재단'
    AND s.name = '2026 KRA지역돌봄 (대학생 봉사자 연계 지역돌봄 지원사업)'
);
