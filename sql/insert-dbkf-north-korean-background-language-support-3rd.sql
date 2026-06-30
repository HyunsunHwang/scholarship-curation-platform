-- DB김준기문화재단 제3차 북한배경대학생 어학교육지원
-- 포스터 이미지: /public/posters/dbkf-north-korean-background-language-support-3rd.png
-- 유의: 원문 지원유형 '학업지원금'은 스키마 enum 호환을 위해 '학업장려금'으로 저장

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
  qual_enrollment_status,
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
  '제3차 북한배경대학생 어학교육지원',
  'DB김준기문화재단',
  '재단법인',
  ARRAY['학업장려금']::support_category[],
  '2개월 파고다어학원 정규 강의 수강료 전액 지원, 학습 성취도/출석률에 따른 장학금 및 영어시험 비용 지원',
  DATE '2026-05-11',
  DATE '2026-06-19',
  DATE '2026-06-23',
  40,
  '내국인',
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['북한 출생 또는 제3국 출생 북한이탈주민 대학생 및 대학원생']::text[],
  true,
  '온라인 (포스터 QR 스캔 후 신청서 작성)',
  'https://www.instagram.com/international_democracy_hub/',
  'https://www.instagram.com/international_democracy_hub/',
  'IDH (English@idhkorea.org)',
  E'활동기간: 2026.07.01 ~ 08.31 (약 2개월). 파고다어학원 종로/신촌/강남 지점 중 택 1. 6월 29일(월) O.T 필수 참석.\n'
  || E'지원유형 원문 "학업지원금"은 시스템 분류상 학업장려금으로 저장.',
  3,
  '지원접수',
  '2026-05-11 ~ 2026-06-19',
  '결과발표',
  '2026-06-23',
  'O.T 진행 (필수 참석)',
  '2026-06-29',
  DATE '2026-05-29',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '제3차 북한배경대학생 어학교육지원'
    AND s.organization = 'DB김준기문화재단'
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
    SET poster_image_url = '/posters/dbkf-north-korean-background-language-support-3rd.png'
    WHERE name = '제3차 북한배경대학생 어학교육지원'
      AND organization = 'DB김준기문화재단'
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
    SET original_notice_image_urls = ARRAY['/posters/dbkf-north-korean-background-language-support-3rd.png']
    WHERE name = '제3차 북한배경대학생 어학교육지원'
      AND organization = 'DB김준기문화재단'
      AND (original_notice_image_urls IS NULL OR cardinality(original_notice_image_urls) = 0);
  END IF;
END $$;
