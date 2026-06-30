-- 중앙대학교 국제물류학과 글로벌 전공 연수 프로그램 (2026 여름)
-- institution_type: 입력값 "대학교"는 enum 부재로 "학교법인"으로 정규화
-- can_overlap: 공고 미기재(대학혁신지원사업 기준)라 true로 두고 note에 기준 확인 문구 반영

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
  qual_gpa_min,
  qual_gpa_last_semester_min,
  qual_nationality,
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
  selection_note,
  selection_stage_1_schedule,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026학년도 여름 국제물류학과 글로벌 전공 연수 프로그램',
  '중앙대학교 국제물류학과 (국제처 국제교류팀 주관)',
  '학교법인',
  ARRAY['해외연수비']::support_category[],
  '장학금 250만 원 지급 (학생 자부담 약 100만 원 발생)',
  DATE '2026-05-14',
  DATE '2026-05-20',
  NULL,
  NULL,
  ARRAY['중앙대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY[1, 2, 3, 4]::int[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['경영경제대학 국제물류학과']::text[],
  NULL,
  NULL,
  '내국인'::nationality_type,
  ARRAY[
    '''25년 글로벌 전공 연수 참가 이력자 지원 불가',
    '휴학생 제외',
    '졸업예정자 제외',
    '수업연한 초과자 제외',
    '취약계층 가산점 부여'
  ]::text[],
  true,
  ARRAY[
    '참가학생 제출양식(PDF)',
    '관련 증빙서류 일체'
  ]::text[],
  '이메일 접수 (logistics@cau.ac.kr)',
  'https://logistics.cau.ac.kr',
  'https://ebiz.cau.ac.kr',
  '국제물류학과 사무실',
  E'헝가리 BME 연수 프로그램이며, 2026 여름 계절학기 1학점이 인정됩니다.\n'
  || E'중복수혜 가능 여부는 대학혁신지원사업 및 학내 기준을 따릅니다.\n'
  || E'취소자 발생 시 예비 합격자 선발이 진행될 수 있습니다.',
  1,
  '서류(40)+학과행사(30)+수상(10)+성적(20)',
  '레인보우 비교과 마일리지 및 학과 행사 참여도 비중 높음 (30%)',
  '발표: 추후 공지',
  DATE '2026-05-14',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '중앙대학교 국제물류학과 (국제처 국제교류팀 주관)'
    AND s.name = '2026학년도 여름 국제물류학과 글로벌 전공 연수 프로그램'
);
