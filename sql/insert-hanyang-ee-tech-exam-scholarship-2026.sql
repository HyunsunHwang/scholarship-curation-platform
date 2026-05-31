-- 2026 기술고시(5급 공채 전기) 장학생 — 외부 협회 + 한양대 전기공학전공
-- 매핑 메모:
-- - institution_type: 사설재단·협회+학과 → ENUM 한 개만 → `기타`(원문 취지는 organization·note)
-- - support_types: 학업보조비 → 학업장려금
-- - apply_start_date 미제공 → apply_end_date와 동일
-- - can_overlap 미제공 → 1회성 격려금 성격으로 보수적 false
-- - 학적 미명시 → 맞춤 필터용 `재학` 보수적 처리(공고로 정정 가능)

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university, qual_school_location, qual_school_category, qual_enrollment_status, qual_major,
  qual_special_info, can_overlap,
  required_documents, apply_method, apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026 기술고시(5급 공채 전기) 장학생',
  '외부 협회 / 한양대학교 공과대학 전기공학전공',
  '기타',
  ARRAY['학업장려금']::support_category[],
  2000000,
  '1인당 200만 원(1회성 지급)',
  DATE '2026-05-13',
  DATE '2026-05-13',
  NULL,
  2,
  ARRAY['한양대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY['전기공학전공'],
  ARRAY[
    '2026년 기술고시(5급 공채 전기) 1차 시험 합격자 및 면제자(1차 패스자 한정)',
    '기존 협회 장학금 수혜 이력이 없는 자'
  ]::text[],
  false,
  ARRAY[
    '추천서',
    '동의서',
    '기술고시 수험표 사본'
  ]::text[],
  '전화 접수 (한양대 전기공학 행정팀 02-2220-3113)',
  '',
  'https://www.hanyang.ac.kr/',
  '02-2220-3113 / leeunhae@hanyang.ac.kr (한양대 전기공학 행정팀)',
  E'추천서·동의서·수험표 사본 등은 행정팀 선발 확정자만 추후 제출(사전 제출 불필요·공고 기준).\n'
  || E'기한 엄수.',
  1,
  '유선 신청·행정 확인 후 제출',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '외부 협회 / 한양대학교 공과대학 전기공학전공'
    AND s.name = '2026 기술고시(5급 공채 전기) 장학생'
);
