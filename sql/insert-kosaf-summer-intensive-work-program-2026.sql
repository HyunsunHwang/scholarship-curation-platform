-- 한국장학재단 2026년 하계방학 집중근로프로그램
-- 포스터 이미지: /public/posters/kosaf-2026-summer-intensive-work-program.png
-- 유의: 공고 내 선발결과 공개일 표기 불일치(2026-06-16 vs 본문 2026-06-26)

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
  qual_enrollment_status,
  qual_income_level_min,
  qual_income_level_max,
  qual_special_info,
  can_overlap,
  apply_method,
  apply_url,
  homepage_url,
  contact,
  note,
  selection_stages,
  selection_stage_1,
  selection_stage_1_schedule,
  selection_stage_2,
  selection_stage_2_schedule,
  selection_stage_3,
  selection_stage_3_schedule,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026년 하계방학 집중근로프로그램',
  '한국장학재단',
  '공공기관',
  ARRAY['기타']::support_category[],
  0,
  '근로시간에 따른 시급 (월 단위 지급)',
  DATE '2026-05-20',
  DATE '2026-05-29',
  DATE '2026-06-16',
  ARRAY['재학', '신입생']::enrollment_status_type[],
  1,
  9,
  ARRAY[
    '한국장학재단 학자금 지원구간 신청자',
    '편입생 및 재입학생 포함(공고 기준)'
  ]::text[],
  false,
  '온라인(한국장학재단 누리집)',
  'https://www.kosaf.go.kr/',
  'https://www.kosaf.go.kr/',
  '한국장학재단 (1599-2000)',
  E'최소 3개 이상 근로지 선택 필수. 동일 희망근로지 신청자 간 상대평가 선발.\n'
  || E'우선추천대상자 안내: 2026-06-09.\n'
  || E'근로장학생 대학 최종 선발 기간: 2026-06-10 ~ 2026-06-15.\n'
  || E'근로장학생 선발 결과 공개일은 공고 내 2026-06-16 및 본문 2026-06-26 표기가 병기되어 있어 원문 재확인 필요.',
  3,
  '우선추천대상자 안내',
  '2026-06-09',
  '근로장학생 대학 최종 선발',
  '2026-06-10 ~ 2026-06-15',
  '근로장학생 선발 결과 공개',
  '2026-06-16',
  DATE '2026-05-29',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '2026년 하계방학 집중근로프로그램'
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
    SET poster_image_url = '/posters/kosaf-2026-summer-intensive-work-program.png'
    WHERE name = '2026년 하계방학 집중근로프로그램'
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
    SET original_notice_image_urls = ARRAY['/posters/kosaf-2026-summer-intensive-work-program.png']
    WHERE name = '2026년 하계방학 집중근로프로그램'
      AND organization = '한국장학재단'
      AND (original_notice_image_urls IS NULL OR cardinality(original_notice_image_urls) = 0);
  END IF;
END $$;
