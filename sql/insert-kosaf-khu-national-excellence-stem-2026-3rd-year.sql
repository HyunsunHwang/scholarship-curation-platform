-- 2026 국가우수장학금(이공계) 재학중우수자(3학년)
--
-- 매핑 메모:
-- • institution_type 입력값 '공공기관 / 대학교'는 단일 enum 제약상 '공공기관'으로 매핑
-- • support_types 입력값 '{학비감면}'는 enum 제약상 {'등록금'}으로 매핑, 기초생활수급자 생활비는 support_amount_text/note에 보존
-- • qual_grade/qual_credit 컬럼은 현재 스키마에 없어 qual_gpa_min/qual_gpa_last_semester_min + qual_special_info로 이관
-- • apply_end_date 시각(23:59) 및 연장 불가 문구는 note에 보존
-- • apply_start_date 미제공으로, 운영 입력 기준에서 보정 필요

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  qual_university,
  qual_major,
  qual_enrollment_status,
  qual_gpa_min,
  qual_gpa_last_semester_min,
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
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026 국가우수장학금(이공계) 재학중우수자(3학년)',
  '한국장학재단 / 경희대학교',
  '공공기관',
  ARRAY['등록금']::support_category[],
  0,
  '2년(정규 잔여학기) 등록금 전액 지원 (기초생활수급자는 학기당 생활비 250만 원 추가)',
  DATE '2026-05-12',
  DATE '2026-05-12',
  ARRAY['경희대학교']::text[],
  ARRAY[
    '이과대',
    '식품영양학과',
    '공과대',
    '생명과학대',
    '응용과학대',
    '소프트웨어융합대',
    '전자정보대'
  ]::text[],
  ARRAY['재학']::enrollment_status_type[],
  3.3,
  3.3,
  false,
  ARRAY[
    '3학년 재학생 대상 (5~6학기 이수자)',
    '총 평균 평점 3.3 이상, 직전학기 평점 3.3 이상 (4.3 만점 기준)',
    '또는 백분위 87점 이상 기준 적용 가능',
    '총 이수학점 40% 이상 (졸업이수학점 기준)',
    '직전학기 12학점 이수',
    '타 교외 장학금 전액 수혜자 제외 (국가장학금은 예외)'
  ]::text[],
  ARRAY[
    '장학금 신청서',
    '전공 분야 우수 활동 내역서 및 증빙',
    '전인적 인재 성장 계획서 및 증빙'
  ]::text[],
  '온라인 접수 (인포21(Info21) 내 파일 업로드)',
  'https://info21.khu.ac.kr',
  'https://www.kosaf.go.kr',
  '서울 02-961-0045 / 국제 031-201-3059 (학생지원센터(장학))',
  E'접수 마감: 2026-05-12 23:59 (연장 불가 유의)\n'
  || E'모든 서류는 1개의 PDF로 병합 후 업로드 필수.\n'
  || E'기초생활수급자는 학기당 생활비 250만 원 추가 지원.',
  1,
  '서류 심사',
  DATE '2026-05-10',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '한국장학재단 / 경희대학교'
    AND s.name = '2026 국가우수장학금(이공계) 재학중우수자(3학년)'
);
