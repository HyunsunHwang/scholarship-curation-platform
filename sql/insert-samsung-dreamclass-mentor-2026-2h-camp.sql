-- 삼성드림클래스 2026년 2학기 대학생멘토(유형2 방학캠프)
-- 포스터 이미지: /public/posters/samsung-dreamclass-mentor-2026-2h-camp.png
-- 유의: 원문 지원유형 '복합지원'은 스키마 enum 호환을 위해 '학업장려금'으로 저장

INSERT INTO public.scholarships (
  name,
  organization,
  institution_type,
  support_types,
  support_amount_text,
  apply_start_date,
  apply_end_date,
  announcement_date,
  qual_enrollment_status,
  can_overlap,
  required_documents,
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
  selection_stage_4,
  selection_stage_4_schedule,
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '2026년 2학기 삼성드림클래스 대학생멘토 (유형2 방학캠프)',
  '삼성전자',
  '기업',
  ARRAY['학업장려금']::support_category[],
  '장학금 200만원, 활동인증서, 삼성 임직원 취업 멘토링, 취업·어학 관련 온라인 강좌, 리움미술관 멤버십 등 혜택',
  DATE '2026-05-14',
  DATE '2026-06-10',
  DATE '2026-07-15',
  ARRAY['재학', '휴학']::enrollment_status_type[],
  true,
  ARRAY['온라인 지원서', '재학(휴학)증명서', '본인 신분증']::text[],
  '온라인 (삼성드림클래스 공식 누리집)',
  'https://www.dreamclass.org',
  'https://www.dreamclass.org',
  '삼성드림클래스 사무국',
  E'[활동기간] 2026.08 ~ 2027.02 (7개월). [필수참석] 8월 1주차 여름캠프(4박 5일), 서울 대면면접, 7월 말 오프라인 정기연수(수원 성균관대 1박 2일). 매주 온라인 멘토링 진행 필수.\n'
  || E'[활동내용] 유형1 방문멘토링(학기중) 및 유형2 방학캠프(여름) 운영.\n'
  || E'[지원유형 매핑] 원문 "복합지원"은 시스템 분류상 학업장려금으로 저장.',
  4,
  '서류접수',
  '2026-05-14 ~ 2026-06-10 10:00',
  '서류발표',
  '2026-06-17 14:00',
  '대면면접 (서울 삼성전자 서초사옥)',
  '2026-07-01 ~ 2026-07-03 중 하루',
  '면접발표',
  '2026-07-15 14:00',
  DATE '2026-05-29',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '2026년 2학기 삼성드림클래스 대학생멘토 (유형2 방학캠프)'
    AND s.organization = '삼성전자'
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
    SET poster_image_url = '/posters/samsung-dreamclass-mentor-2026-2h-camp.png'
    WHERE name = '2026년 2학기 삼성드림클래스 대학생멘토 (유형2 방학캠프)'
      AND organization = '삼성전자'
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
    SET original_notice_image_urls = ARRAY['/posters/samsung-dreamclass-mentor-2026-2h-camp.png']
    WHERE name = '2026년 2학기 삼성드림클래스 대학생멘토 (유형2 방학캠프)'
      AND organization = '삼성전자'
      AND (original_notice_image_urls IS NULL OR cardinality(original_notice_image_urls) = 0);
  END IF;
END $$;
