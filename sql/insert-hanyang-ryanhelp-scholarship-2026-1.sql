-- 2026-1 라이언헬프 장학금 — 한양대학교(서울) 학생지원팀
-- 매핑 메모:
-- - support_types: 학업보조비 → 학업장려금
-- - apply_end 24:00는 qual_special_info·note (DATE 컬럼은 일자만)
-- - 성적 컷 없음 → qual_gpa_* 생략(NULL)
-- - organization: 원문 「한양대학교 (서울캠퍼스),학생처 학생지원팀」→ 슬래시 없이 한 줄로 정리

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount, support_amount_text,
  apply_start_date, apply_end_date, announcement_date, selection_count,
  qual_university, qual_school_location, qual_school_category, qual_enrollment_status,
  qual_special_info, can_overlap,
  required_documents, apply_method, apply_url, homepage_url, contact, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home, is_recommended
)
SELECT
  '2026-1 라이언헬프 장학금',
  '한양대학교 (서울캠퍼스) 학생처 학생지원팀',
  '대학교',
  ARRAY['학업장려금']::support_category[],
  5000000,
  '1인당 최대 500만 원(심사 후 차등 지급)',
  DATE '2026-04-01',
  DATE '2026-05-08',
  NULL,
  NULL,
  ARRAY['한양대학교'],
  ARRAY['국내 대학']::school_location_type[],
  ARRAY['4년제']::school_category_type[],
  ARRAY['재학']::enrollment_status_type[],
  ARRAY[
    '서울캠퍼스 한정',
    '정규학기 재학생(학업연장자·유예자 등 제외 — 공고 기준)',
    '유효 이수학기 2학기 이상',
    '성적 컷 없음(공고 기준)',
    '최근 1년 이내 긴급 가계곤란 사유(실직·폐업·사망·중대질병 등 — 공고 참고)',
    '개별 인터뷰 필수 참석',
    '소득분위 무관. 교내 타 생활비 장학금과 중복 시 차감 지급 가능',
    '접수 마감: 2026-05-08 24:00 — 신청 기간 엄수'
  ]::text[],
  true,
  ARRAY[
    '경제곤란 증빙서류(1개 PDF)',
    '장학금 신청서(지정 양식)'
  ]::text[],
  '온라인 접수 (HY-in 로그인 → 등록장학 → 기타교내장학신청)',
  '',
  'https://www.hanyang.ac.kr/',
  '02-2220-0095 (서울캠퍼스 학생지원팀)',
  E'제출 파일명 형식 등 세부 규정은 공고·HY-in 안내를 따릅니다.',
  1,
  '서류심사·면접',
  CURRENT_DATE,
  true,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '한양대학교 (서울캠퍼스) 학생처 학생지원팀'
    AND s.name = '2026-1 라이언헬프 장학금'
);
