-- 2026-1 경희목련장학 (구. 장학사정관제장학)
--
-- 매핑 메모:
-- • institution_type 입력값 '대학교'는 enum 제약상 '학교법인'으로 매핑
-- • support_types 입력값 '{학비감면, 학업보조비}'는 enum 제약상 {'등록금', '학업장려금'}으로 매핑
-- • qual_grade 컬럼은 현재 스키마에 없어 qual_special_info로 이관
-- • apply_end_date 시각(23:59) 및 '연장 불가' 문구는 note에 보존
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
  qual_enrollment_status,
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
  '2026-1 경희목련장학',
  '경희대학교 학생지원센터(장학)',
  '학교법인',
  ARRAY['등록금', '학업장려금']::support_category[],
  0,
  '심사에 따라 차등 지급 (등록금 또는 생활비 중 택 1 신청)',
  DATE '2026-05-24',
  DATE '2026-05-24',
  ARRAY['경희대학교']::text[],
  ARRAY['재학']::enrollment_status_type[],
  true,
  ARRAY[
    '예상치 못한 가계 곤란자 (사고, 질병, 실직, 재해 등)',
    '성적 심사 없음 (성적 기준 미적용)',
    '서울/국제 캠퍼스 공통',
    '학기초과자 및 졸업유예자 신청 가능'
  ]::text[],
  ARRAY[
    '장학신청서',
    '가계곤란 증빙서류(6개월 이내 발급분)'
  ]::text[],
  '온라인 접수 (info21 접속 → 등록/장학 → 장학신청)',
  'https://info21.khu.ac.kr',
  'https://info21.khu.ac.kr',
  '서울 02-961-0045~6 / 국제 031-201-3055~9',
  E'마감: 2026-05-24 23:59 (연장 절대 불가)\n'
  || E'모든 서류는 1개의 PDF로 병합 후 제출 필수.\n'
  || E'지원유형: 등록금 또는 생활비 중 택 1 (생활비 신청 시 등록금 초과 수혜 가능).',
  1,
  '서류 심사',
  DATE '2026-05-10',
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '경희대학교 학생지원센터(장학)'
    AND s.name = '2026-1 경희목련장학'
);
