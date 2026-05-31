-- 북경대학교 Yenching Academy — 2026학년도 국제 장학 프로그램(중국석사·전액 장학)
--
-- 매핑 메모:
-- • support_category: 「항공권·숙박 등」 ENUM에 비대응값 → 등록금·생활비·해외연수비(해외 과정)·기타로 요약 반영
-- • qual_language / 국제 전형 세부국적: 해당 컬럼 없음 → qual_special_info
-- • qual_major·qual_university: 전공 무관·대학 무제한 매칭 → NULL
-- • institution_type: DB에 text 타입이라 원문 「해외 대학」 유지 가능

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
  qual_age_max,
  qual_enrollment_status,
  qual_major,
  qual_nationality,
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
  selection_stage_2,
  selection_stage_3,
  selection_note,
  collected_at,
  is_verified,
  list_on_home
)
SELECT
  '2026학년도 중국 북경대 Yenching Academy 장학생',
  '북경대학교 (Peking University) Yenching Academy',
  '해외 대학',
  ARRAY['등록금', '생활비', '해외연수비', '기타']::support_category[],
  0,
  '등록금, 기숙사비, 1회 왕복 항공료, 기본 의료보험, 월 생활비, 연구 관련 비용 등(1년 차 전액 지원, 2년 차는 성적 우수자 연장 가능)',
  DATE '2025-09-10',
  DATE '2025-12-01',
  NULL,
  NULL,
  NULL,
  NULL,
  ARRAY['4년제']::school_category_type[],
  29,
  ARRAY['졸업', '졸업예정']::enrollment_status_type[],
  NULL,
  NULL,
  false,
  ARRAY[
    '국제 지원자(International Applicants) 전형: 중국 국적자 제외, 비중국 국적(대한민국 등 포함) 대상으로 공고를 확인하세요',
    'IELTS Academic 7.0 / TOEFL iBT 100 / Cambridge English 185 이상 중 1개 필수 · 2024년 9월 1일 이후 응시분만 인정 · TOEFL MyBest 등 불인정 공고 재확인',
    '영어 원어민이거나 영어 전용 학위과정 졸업자는 어학 성적 면제 가능(공고 기준)',
    '기졸업자 또는 2026년 8월 31일 이전 학사 학위 취득(또는 취득 예정)자',
    '부교수(Associate Professor) 이상 또는 정교수(Professor) 추천서 2부 필수',
    '중국학 및 학제 간 연구(China Studies 및 interdisciplinary 관심) 어필 요구',
    '원서 접수 마감(북경 시각 오전 9시, 2025-12-01)까지 온라인 추천서 접수까지 완료되어야 함',
    '합격 후 Credential Evaluation 등 추가 학위 인증 요구 가능 · 화상 면접: 12월~3월 경 예정(공고 기준)',
    '역대 29세 초과 합격 사례는 거의 없음(통계적 참고)·합격자 평균 연령 약 23세 전후로 알려져 있음'
  ]::text[],
  ARRAY[
    '온라인 지원서',
    '자기소개서(영문 또는 중문 등 공고 규격, 750자 이내 표기 참고)',
    '연구계획서(최대 1500자 등 공고 규격 참고)',
    '영문 CV(최대 2장 등 공고 규격 참고)',
    '공식 영문 학사 성적증명서',
    '재학/졸업증명서(영문 등 공식 서류)',
    '영어 시험 성적표(기관 공식 발송 또는 공고 절차)',
    '영문 추천서 2부(직급·제출 방법은 공고 필수 확인)'
  ],
  '온라인 접수 — 추천서는 마감 전 시스템 접수 완료 필수',
  'https://apply.yca.pku.edu.cn/',
  'https://yenchingacademy.pku.edu.cn/index.htm',
  'yca-admissions@pku.edu.cn / +86-10-62766358',
  $n$
합격자는 12월~3월 중 화상 면접(Live video interview)이 진행될 수 있습니다.
최종 합격 시 학위 인증(Credential Evaluation) 등 추가 제출이 요구될 수 있습니다.
서류는 공고에 따라 영문 또는 중문 작성·번역·공증 요건을 반드시 확인하세요.
$n$,
  3,
  '서류 심사',
  '화상 면접(예정)',
  '최종 선발 및 입학 절차',
  '일정·시간대(북경 기준)·제출 형식은 Yenching Academy 공식 공지를 우선 확인하세요.',
  CURRENT_DATE,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scholarships s
  WHERE s.organization = '북경대학교 (Peking University) Yenching Academy'
    AND s.name = '2026학년도 중국 북경대 Yenching Academy 장학생'
);
