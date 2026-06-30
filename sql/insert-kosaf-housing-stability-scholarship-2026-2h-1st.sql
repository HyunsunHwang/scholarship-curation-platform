-- 한국장학재단 2026년 2학기 1차 주거안정장학금
-- 포스터 이미지: /public/posters/kosaf-housing-stability-2026-2h-1st.png
-- 유의: announcement_date 는 공고상 '추후 공개'로 기재되어 NULL 처리

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
  qual_nationality,
  qual_enrollment_status,
  qual_age_max,
  qual_special_info,
  can_overlap,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026년 2학기 1차 주거안정장학금',
  '한국장학재단',
  '공공기관',
  ARRAY['생활비']::support_category[],
  0,
  '월 20만원 한도 범위 내 (연간 최대 240만원 지원), 학생이 지출한 비용(실비)을 개별 지급',
  DATE '2026-05-22',
  DATE '2026-06-22',
  NULL,
  '내국인',
  ARRAY['재학', '신입생']::enrollment_status_type[],
  39,
  ARRAY[
    '미혼',
    '기초생활수급자 또는 차상위계층',
    '원거리 진학자 (신청 대학생 부모 모두의 주민등록상 주소지가 신청 대학생 소속 대학 기준 원거리 지역)',
    '편입생·재입학생·복학생 포함(공고 기준)'
  ]::text[],
  false,
  '온라인(한국장학재단 누리집 및 모바일 앱)',
  'https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_18',
  'https://www.kosaf.go.kr/ko/scholar.do?pg=scholarship05_12_18',
  '한국장학재단 국가장학실 (1599-2000)',
  E'서류제출 및 가구원 동의기간: 2026.05.22(금) 09:00 ~ 2026.06.29(월) 18:00.\n'
  || E'주거안정장학금 참여 대학 소속 학생만 대상. 신입생은 입학예정(확정) 대학 선택 필수.\n'
  || E'국가 및 지방자치단체에서 지원하는 주거 관련 지원금과 중복 지원 불가.\n'
  || E'선발/발표 일정은 공고 기준 추후 공개.',
  DATE '2026-05-29',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '2026년 2학기 1차 주거안정장학금'
    AND s.organization = '한국장학재단'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scholarships'
      AND column_name = 'poster_image_url'
  ) THEN
    UPDATE public.scholarships
    SET poster_image_url = '/posters/kosaf-housing-stability-2026-2h-1st.png'
    WHERE name = '2026년 2학기 1차 주거안정장학금'
      AND organization = '한국장학재단'
      AND (poster_image_url IS NULL OR poster_image_url = '');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scholarships'
      AND column_name = 'original_notice_image_urls'
  ) THEN
    UPDATE public.scholarships
    SET original_notice_image_urls = ARRAY['/posters/kosaf-housing-stability-2026-2h-1st.png']
    WHERE name = '2026년 2학기 1차 주거안정장학금'
      AND organization = '한국장학재단'
      AND (original_notice_image_urls IS NULL OR cardinality(original_notice_image_urls) = 0);
  END IF;
END $$;
