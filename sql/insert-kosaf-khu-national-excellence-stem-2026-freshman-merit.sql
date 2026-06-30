-- 2026 국가우수장학금(이공계) 성적우수유형(1학년)
--
-- 매핑 메모:
-- • institution_type 입력값 '공공기관 / 대학교'는 단일 enum 제약상 '공공기관'으로 매핑
-- • support_types 입력값 '{학비감면}'는 enum 제약상 {'등록금'}으로 매핑, 기초생활수급자 생활비는 support_amount_text/note에 보존
-- • apply_end_date 시각(23:59) 및 연장 불가 문구는 note에 보존
-- • apply_start_date 미제공으로, 운영 입력 기준에서 보정 필요

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  qual_university,
  qual_major,
  qual_enrollment_status,
  qual_special_info,
  required_documents,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  can_overlap,
  selection_stages,
  selection_stage_1,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026 국가우수장학금(이공계) 성적우수유형(1학년)',
  '한국장학재단 / 경희대학교',
  '공공기관',
  ARRAY['등록금']::support_category[],
  '정규학기(최대 8~10회) 등록금 전액 지원 (기초생활수급자는 학기당 생활비 250만 원 추가)',
  DATE '2026-05-12',
  DATE '2026-05-12',
  ARRAY['경희대학교']::text[],
  ARRAY[
    '이과대',
    '식품영양학과',
    '자율전공학부',
    '공과대',
    '생명과학대',
    '응용과학대',
    '소프트웨어융합대',
    '전자정보대',
    '자유전공학부'
  ]::text[],
  ARRAY['신입생']::enrollment_status_type[],
  ARRAY[
    '2026학년도 1학년 1학기 신입생 대상',
    '수시(고교성적) 또는 정시(수능성적) 기준 충족자',
    '교내 입시장학 수혜자 제외',
    '고교 유형별/수능 영역별 등급 기준 확인 필수'
  ]::text[],
  ARRAY[
    '증빙확인서',
    '전공 분야 우수 활동 내역서',
    '전인적 인재 성장 계획서',
    '고교생활기록부'
  ]::text[],
  '온라인 접수 (인포21(Info21) 내 파일 업로드)',
  'https://info21.khu.ac.kr',
  'https://www.kosaf.go.kr',
  '서울 02-961-0045 / 국제 031-201-3059 (학생지원센터(장학))',
  E'접수 마감: 2026-05-12 23:59 (연장 불가)\n'
  || E'모든 서류는 1개의 PDF로 병합 후 업로드 필수.\n'
  || E'기초생활수급자는 학기당 생활비 250만 원 추가 지원.',
  false,
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
    AND s.name = '2026 국가우수장학금(이공계) 성적우수유형(1학년)'
);
