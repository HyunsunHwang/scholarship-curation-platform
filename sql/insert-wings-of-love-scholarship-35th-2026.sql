-- 사회복지법인 사랑의 날개 — 제35회 사랑의 날개 장학금
-- institution_type 원문 「재단」→ `재단법인`
-- support_types 원문 비어 있음 → 일반 장학금 지원이므로 `학업장려금`
-- 공고 게시: 건국대학교 게시판 URL(apply_url), 접수처는 사랑의 날개

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
  qual_school_location,
  qual_school_category,
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
  collected_at,
  is_verified,
  list_on_home,
  is_recommended
)
SELECT
  '제35회 사랑의 날개 장학금',
  '사회복지법인 사랑의 날개',
  '재단법인',
  ARRAY['학업장려금']::support_category[],
  '100만원',
  DATE '2026-06-01',
  DATE '2026-07-01',
  NULL,
  10,
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제', '전문대', '대학원']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY[
    '장애인',
    '장애인 필수. 기초생활수급자/차상위/저소득층 우대',
    '[제외] 본 법인 장학금 수혜 경험자',
    '[제외] 사이버대·방송통신대·사내대학',
    '오프라인 전달식 본인 직접 참여 필수'
  ]::text[],
  false,
  ARRAY[
    '추천서',
    '자기소개서',
    '개인정보 수집·이용 동의서',
    '재학증명서',
    '성적증명서',
    '주민등록등본',
    '장애인 등록증 또는 복지카드 사본',
    '소득증빙서류'
  ]::text[],
  '우편접수',
  'https://www.konkuk.ac.kr/konkuk/2239/subview.do',
  'https://www.konkuk.ac.kr/konkuk/2239/subview.do',
  'wingspolla@naver.com / 02-518-3357',
  E'우편접수만 가능(7.1 소인 유효, 착불 불가, 서울특별시 강남구 학동로 209 6층).\n'
  || E'본 법인 장학금 수혜 경험자 제외. 오프라인 전달식 본인 직접 참여 필수. 사이버대/방송통신대/사내대학 불가.',
  1,
  '서류심사',
  DATE '2026-06-02',
  false,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '사회복지법인 사랑의 날개'
    AND s.name = '제35회 사랑의 날개 장학금'
);
