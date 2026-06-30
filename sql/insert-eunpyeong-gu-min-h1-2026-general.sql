-- 2026 상반기 은평구민 장학생 (일반) — (재)은평구민장학재단
-- institution_type 원문 "공공/지자체 재단" → ENUM `재단법인` (조직 형태 기준), 지자체 연계 장학금
-- qual_university 비어 있음 → 전국 대학 조건 없음 / qual_school_category로 4년제·전문대 한정 + 제외 학교 형태는 note·qual_special_info 반영

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university,
  qual_school_location, qual_school_category, qual_enrollment_status,
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
  '2026 상반기 은평구민 장학생 (일반)',
  '(재)은평구민장학재단',
  '재단법인',
  ARRAY['등록금']::support_category[],
  2000000,
  '최대 200만원 (타 장학금 수령액이 있을 시 차액 지급)',
  '2026-04-27',
  '2026-05-11',
  '2026-05-31',
  NULL,
  NULL,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  NULL,
  3.0,
  8,
  ARRAY['은평구']::text[],
  ARRAY[
    '공고일 현재 은평구 2년 이상 계속 거주 (학업 사유 타 지역 거주 시 예외 인정)',
    '1가구당 1명 신청 제한',
    '[가점] 장애인 본인, 군인/소방관/경찰관 자녀, 다문화가정'
  ]::text[],
  true,
  ARRAY[
    '신청서',
    '개인정보 동의서',
    '주민등록초본',
    '주민등록등본',
    '재학증명서',
    '성적증명서',
    '학자금 지원구간 통지서',
    '등록금 납부 입증 서류',
    '통장사본',
    '가점 증빙서류(해당자)'
  ]::text[],
  '등기우편 또는 방문 접수',
  'https://www.epjh.or.kr',
  'https://www.epjh.or.kr',
  '02-351-8512~3 (은평구청 시민교육과)',
  E'학교 형태: 정규 4년제 및 전문대 (학점은행제·사이버대·방통대 제외; 공고문 확인).\n'
  || E'평점: 2025년 2학기 평균 3.0/4.5 이상, 신입생은 고등학교 3학년 성적 기준(공고문).\n'
  || E'접수 마감 당일 16:00, 점심시간(12:00~13:00) 및 주말·공휴일 접수 불가.\n'
  || E'팩스·스캔본 불가. 등기우편은 마감일 소인 불인정·도착일 기준.\n'
  || E'공고일 이후 발급 서류만 인정, 주민등록등본 등 주민번호 뒷자리 마스킹 필수.',
  1,
  '서류심사',
  '2026-05-03',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '(재)은평구민장학재단'
    AND s.name = '2026 상반기 은평구민 장학생 (일반)'
);
