-- 재단법인 산학협동재단 2026학년도 산학재단 디딤돌 장학금
-- 포스터 이미지: /public/posters/sanhak-didimdol-2026.png
-- 유의: 원문 지원유형 '생활지원금'은 스키마 enum 호환을 위해 '생활비'로 저장

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
  qual_academic_year,
  qual_enrollment_status,
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
  '2026학년도 산학재단 디딤돌 장학금',
  '재단법인 산학협동재단',
  '재단법인',
  ARRAY['생활비']::support_category[],
  800000,
  '월 80만원 (연 960만원), 전 학년(4년, 8학기) 매월 지급',
  DATE '2026-05-18',
  DATE '2026-07-17',
  DATE '2026-08-31',
  15,
  ARRAY[1::smallint],
  ARRAY['재학', '신입생']::enrollment_status_type[],
  ARRAY[
    '국내 4년제 대학 신입생 (2026학년도 1학년 재학생)',
    '국가장학금 수혜(감면)자',
    '사회적 배려 대상자 우선 선발(기초/차상위/한부모/다문화/새터민/자립준비청년)'
  ]::text[],
  false,
  ARRAY[
    '추천 공문(대학 총장 명의)',
    '장학금 신청서',
    '자기소개서',
    '개인정보동의서',
    '장학생 서약서',
    '성적증명서(1학기)',
    '국가장학금 증명서',
    '학자금 지원구간 통지서',
    '주민등록등본',
    '가족관계증명서',
    '사회적 배려 대상자 증빙서류(해당 시)'
  ]::text[],
  '대학(총장 명의) 추천 후 재단 이메일 접수 (개인 접수 불가)',
  'https://www.sanhakfund.or.kr/client/board/notice_view.asp?sidx=291&cpage=1',
  'https://www.sanhakfund.or.kr/client/board/notice_view.asp?sidx=291&cpage=1',
  '재단법인 산학협동재단 (ksf02@sanhakfund.or.kr / ksf09@sanhakfund.or.kr)',
  E'개인 접수 절대 불가하며 캠퍼스/분교 포함 대학별 1명만 총장 명의 추천 가능. 의학계열 등 5~6년 교육과정 학과 제외. 2~4학년, 편입생 및 재입학생 지원 불가. 매 학기 B+(3.5/4.5) 이상 유지 필수.\n'
  || E'타 민간재단 등록금성 또는 연속성 장학금 중복 수혜 불가.',
  3,
  '1차 서류평가',
  '2026년 7월 말',
  '2차 면접평가',
  '2026-08-06',
  '장학생 선발',
  '2026년 8월 말',
  DATE '2026-05-29',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.name = '2026학년도 산학재단 디딤돌 장학금'
    AND s.organization = '재단법인 산학협동재단'
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
    SET poster_image_url = '/posters/sanhak-didimdol-2026.png'
    WHERE name = '2026학년도 산학재단 디딤돌 장학금'
      AND organization = '재단법인 산학협동재단'
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
    SET original_notice_image_urls = ARRAY['/posters/sanhak-didimdol-2026.png']
    WHERE name = '2026학년도 산학재단 디딤돌 장학금'
      AND organization = '재단법인 산학협동재단'
      AND (original_notice_image_urls IS NULL OR cardinality(original_notice_image_urls) = 0);
  END IF;
END $$;
