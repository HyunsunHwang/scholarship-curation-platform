-- 오일홍장학재단 / 연세대학교 경제학부(상경대학) 2026-1학기
-- 중복 방지: organization + name
-- 직전학기 평량평균 3.7 → qual_gpa_last_semester_min (qual_gpa_min 아님)

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  announcement_date,
  selection_count,
  qual_university,
  qual_school_location,
  qual_school_category,
  qual_enrollment_status,
  qual_major,
  qual_gpa_min,
  qual_gpa_last_semester_min,
  can_overlap,
  qual_special_info,
  required_documents,
  apply_method,
  apply_url,
  contact,
  note,
  selection_stages,
  selection_stage_1,
  selection_stage_1_schedule,
  selection_note,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '오일홍장학재단 장학생',
  '오일홍장학재단',
  '민간재단',
  ARRAY['등록금', '생활비']::support_category[],
  1000000,
  '등록금 지원 100만원 (생활비 장학금으로 전환 가능)',
  DATE '2026-04-28',
  DATE '2026-05-08',
  NULL,
  1,
  ARRAY['연세대학교']::text[],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['상경대학', '경제학부'],
  NULL,
  3.7,
  false,
  ARRAY['경제적 사정이 곤란한 자']::text[],
  ARRAY[
    '장학금 지원서 및 자기소개서(사진동봉/연락처 기입)',
    '전 학년 성적증명서',
    '주민등록등본(상세)',
    '소득분위증명서',
    '개인정보이용동의서',
    '2026-1학기 수혜중인 외부 장학금 내역',
    '기타 증빙서류(선택)'
  ],
  '방문 제출, 우편 제출',
  '',
  '02-2123-2452, 7465',
  $$
모든 서류 원본 제출 필수. 5월 8일(금) 낮 12시 이전 사무실(대우관 본관 206호) 도착분까지 접수. 온라인·이메일 제출 불가.
$$,
  1,
  '서류심사',
  '2026-05-08 12:00까지(대우관 본관 206호 도착)',
  '제출 서류 및 학업·경제적 사정 종합 검토 후 1명 선발.',
  DATE '2026-05-01',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '오일홍장학재단'
    AND s.name = '오일홍장학재단 장학생'
);
