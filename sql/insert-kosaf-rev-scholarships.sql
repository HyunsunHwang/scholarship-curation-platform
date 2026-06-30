-- ──────────────────────────────────────────────────────────────────
-- CSV 120~139번 장학금 INSERT (KOSAF-REV 개정 데이터)
-- 동일 name + organization 중복 방지 포함
-- ──────────────────────────────────────────────────────────────────

-- 1. 제대군인대부지원(나라사랑대출) / 국가보훈부
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_parent_occupation,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '제대군인대부지원(나라사랑대출)', '국가보훈부', '공공기관',
  ARRAY['등록금']::text[], 0,
  '2026-01-02', '2026-12-31', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대']::text[],
  ARRAY['재학','휴학']::text[],
  ARRAY['직업군인','군무원']::text[],
  false,
  ARRAY['등록금 고지서 또는 등록금 납부영수증']::text[],
  '전국 국민은행·농협은행 영업지점 방문 수시 신청',
  'https://www.mpva.go.kr/',
  'https://www.mpva.go.kr/',
  '국가보훈부 등록 10년이상 장기복무 제대군인 대상. 연 이율 4.0%/상환기간 5년. 학자금 대출 타기관 중복 불가.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '제대군인대부지원(나라사랑대출)' AND organization = '국가보훈부'
);

-- 2. 남원의 별 특별장학생 / 춘향장학재단
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_region, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '남원의 별 특별장학생', '춘향장학재단', '지방자치단체',
  ARRAY['생활비']::text[], 0,
  '2026-01-26', '2026-12-31', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대','대학원']::text[],
  ARRAY['재학','휴학']::text[],
  ARRAY['남원']::text[], '내국인',
  false,
  ARRAY['남원의 별 특별장학금 지원 신청서','수상 증명 자료','대회 요강 자료','개인정보 제공 및 활용 동의서']::text[],
  '대상자 본인이 서류 첨부 접수 → 춘향장학재단 운영위원회 심의',
  'https://www.namwon.go.kr/',
  'https://www.namwon.go.kr/',
  '체육·예술 분야 대회수상 또는 국가대표선발 대학생. 본인 또는 보호자 남원시 3년 이상 거주. 춘향인재장학금과 동일종목·동일수상실적 중복 불가.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '남원의 별 특별장학생' AND organization = '춘향장학재단'
);

-- 3. SOS 장학금 / 영천시장학회
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_enrollment_status, qual_region, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  'SOS 장학금', '영천시장학회', '지방자치단체',
  ARRAY['생활비']::text[], 1000000,
  '2025-12-24', '2026-12-31', 20,
  ARRAY['재학','휴학']::text[],
  ARRAY['영천']::text[], '내국인',
  false,
  ARRAY['신청서','개인정보동의서','주민등록등본 또는 초본(1년이상 관내 거주 확인)','화재증명원/재해피해확인서/가족관계증명서','대학생은 재학증명서']::text[],
  '영천시장학회 장학위원회/(재)영천시장학회 이사회 의결',
  'http://www.ycsf.or.kr',
  'http://www.ycsf.or.kr',
  '당해 발생 재난·재해(화재 등) 피해 또는 주 양육자 사망으로 학업 지속이 어려운 대학생 긴급 지원. 당해연도 동일인 중복 지급 불가.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = 'SOS 장학금' AND organization = '영천시장학회'
);

-- 4. 대학생장학금 / (재)인제군장학회
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_gpa_min, qual_region, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '대학생장학금', '(재)인제군장학회', '지방자치단체',
  ARRAY['생활비']::text[], 5000000,
  '2026-01-19', '2026-12-04', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대']::text[],
  ARRAY['재학']::text[],
  2.5,
  ARRAY['인제']::text[], '내국인',
  false,
  ARRAY['장학생 지원서','주민등록등본','개인(신용)정보 수집·이용·제공 및 조회 동의서','재학증명서(신입생은 합격증명서 및 등록금 영수증 사본)','성적증명서(4.5만점 기준)','신입생은 고등학교 성적증명서(최종학년 1·2학기)']::text[],
  '신청자 중 고득점자 순 선발 (저소득층·장애인자녀·예체능특기자 우선)',
  'https://www.inje.go.kr',
  'https://www.inje.go.kr',
  '신청일 기준 인제군 관내 2년 이상 거주 군민 자녀 또는 본인. 저소득층·장애인 자녀 및 예체능 특기자 우선. 대학원생·원격대학·야간대학 제외.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '대학생장학금' AND organization = '(재)인제군장학회'
);

-- 5. 예/체능특기자장학금 / (재)인제군장학회
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_major, qual_region, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '예/체능특기자장학금', '(재)인제군장학회', '지방자치단체',
  ARRAY['생활비']::text[], 5000000,
  '2026-01-19', '2026-12-04', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대']::text[],
  ARRAY['재학']::text[],
  ARRAY['예체능계열']::text[],
  ARRAY['인제']::text[], '내국인',
  false,
  ARRAY['장학생지원서','개인(신용)정보 수집·이용·제공 및 조회 동의서','주민등록등본','가족관계증명서','재학증명서','전년도 수상실적 증명서류(상장 등)']::text[],
  '해당 기관 홈페이지 및 방문 신청',
  'https://www.inje.go.kr',
  'https://www.inje.go.kr',
  '직전 학년도 도 공인대회 2위 이내 또는 전국단위 공인대회 3위 이내 입상(단체전 포함). 인제군 관내 2년 이상 거주 군민 자녀. 복학생은 휴학 기간 중 입상 경력 포함.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '예/체능특기자장학금' AND organization = '(재)인제군장학회'
);

-- 6. 석성장학생 / 재단법인 석성장학회
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_enrollment_status,
  qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '석성장학생', '재단법인 석성장학회', '기타',
  ARRAY['생활비']::text[], 1000000,
  '2026-02-01', '2026-11-30', NULL,
  ARRAY['4년제']::text[],
  ARRAY['재학','휴학']::text[],
  '내국인',
  false,
  ARRAY['장학금 수혜지원서','학교장 또는 관련 단체장 추천서','개인정보 동의서','주민등록초본','통장사본(현금 지급 희망시)']::text[],
  '담임교사/지도교수 또는 단체장 추천을 통해 신청',
  'http://www.seoksung.co.kr',
  'http://www.seoksung.co.kr',
  '모범적인 선행공적이 있는 학생. 학자금대출과 타 장학금 합산이 해당 학기 등록금 초과 시 제외.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '석성장학생' AND organization = '재단법인 석성장학회'
);

-- 7. 특별장학생 / 재단법인 석성장학회
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_enrollment_status, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '특별장학생', '재단법인 석성장학회', '기타',
  ARRAY['생활비']::text[], 1000000,
  '2026-02-01', '2026-11-30', NULL,
  ARRAY['재학','휴학']::text[],
  '내국인',
  false,
  ARRAY['장학금 수혜지원서','학교장 또는 관련 단체장 추천서','개인정보 수집 및 이용 동의서','주민등록초본','현금 지급 사유서 및 통장 사본(해당자)']::text[],
  '담임교사·지도교수 또는 단체장 추천. 한국장학재단 중복심사 결격 사유 없어야 함.',
  'http://www.seoksung.co.kr',
  'http://www.seoksung.co.kr',
  '국가와 국민을 위해 헌신하다 순직한 자의 유자녀, 탈북자, 다문화 가정학생, 특별한 선행으로 언론에 공개되어 추천받은 학생.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '특별장학생' AND organization = '재단법인 석성장학회'
);

-- 8. 대학재학장학금 / 경상남도청
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_enrollment_status,
  qual_gpa_min, qual_income_level_max, qual_region, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '대학재학장학금', '경상남도청', '지방자치단체',
  ARRAY['생활비']::text[], 1000000,
  '2026-09-01', '2026-10-02', 100,
  ARRAY['국내 대학']::text[],
  ARRAY['재학','휴학']::text[],
  3.0, 3,
  ARRAY['경남']::text[], '내국인',
  false,
  ARRAY['장학금 신청서 1부','개인정보 수집이용 등 동의서 1부','주민등록등본 1부','대학교 재학증명서 1부','대학교 성적증명서 1부','고등학교 졸업증명서 또는 검정고시 합격증명서 1부','학자금 지원구간 통지서 1부']::text[],
  '1차 시·군 정량심사 → 2차 장학회 이사/외부 전문가 심사위원회 선발',
  'http://www.gyeongnam.go.kr',
  'http://www.gyeongnam.go.kr',
  '도내 고등학교 졸업, 공고일 기준 도내 주민등록 주소지. 도내 대학 2~4학년 학부 재학생. 경상남도장학회 2025년 수혜자 및 2026년 중복 수혜자 제외. 한 세대 1명만 선발.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '대학재학장학금' AND organization = '경상남도청'
);

-- 9. 배려대상자 / (재)호국장학재단
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_gpa_min, qual_nationality, qual_parent_occupation, qual_special_info,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '배려대상자', '(재)호국장학재단', '기타',
  ARRAY['생활비']::text[], 1000000,
  '2026-03-03', '2026-06-30', 600,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대']::text[],
  ARRAY['재학','휴학']::text[],
  2.0, '내국인',
  ARRAY['직업군인','군무원']::text[],
  ARRAY['다자녀','한부모가정','장애인']::text[],
  false,
  ARRAY['호국장학금 신청서','개인정보수집·이용·제공 및 조회/학자금 중복지원 방지 동의서','성적증명서','등록확인서 또는 등록금 납입증명서','신청인 본인 가족관계증명서','배려대상자 신청시 증빙서류','신청인 본인명의 통장','복무확인서 또는 재직증명서']::text[],
  '해당 기관 홈페이지 및 담당기관 문의',
  'http://www.hoguk.or.kr/',
  'http://www.hoguk.or.kr/',
  '현역군인 및 군무원 자녀 중 다자녀가정(400명)·한부모가정(100명)·장애가정(50명)·공상자(50명) 대상. 방송통신대·사내대학·국비대학·2년 미만 교육과정 제외.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '배려대상자' AND organization = '(재)호국장학재단'
);

-- 10. 성적우수자 / (재)호국장학재단
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_gpa_min, qual_nationality, qual_parent_occupation,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '성적우수자', '(재)호국장학재단', '기타',
  ARRAY['생활비']::text[], 1000000,
  '2026-03-03', '2026-06-30', 600,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대']::text[],
  ARRAY['재학','휴학']::text[],
  4.1, '내국인',
  ARRAY['직업군인','군무원']::text[],
  false,
  ARRAY['호국장학금 신청서','개인정보수집·이용·제공 및 조회/학자금 중복지원 방지 동의서','성적증명서','등록확인서 또는 등록금 납입증명서','신청인 본인 가족관계증명서','신청인 본인명의 통장','복무확인서 또는 재직증명서']::text[],
  '해당 기관 홈페이지 및 담당기관 문의',
  'http://www.hoguk.or.kr/',
  'http://www.hoguk.or.kr/',
  '현역군인 및 군무원의 대학 재학중인 자녀 중 성적우수자. 직전 학기 성적 4.5만점 기준 4.1 이상. 정규학기 초과등록자 제외.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '성적우수자' AND organization = '(재)호국장학재단'
);

-- 11. 국고학자금 / 사립학교직원연금공단
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '국고학자금', '사립학교직원연금공단', '공공기관',
  ARRAY['등록금']::text[], 0,
  '2026-01-02', '2026-06-15', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대']::text[],
  ARRAY['재학','휴학']::text[],
  '내국인',
  false,
  ARRAY['등록금고지서(학점은행제: 교육비납입증명서)','가족관계증명서 또는 주민등록표등본','재학증명서','입학허가서(신입생)']::text[],
  '홈페이지(www.tp.or.kr) 신청',
  'https://www.tp.or.kr',
  'https://www.tp.or.kr',
  '사립학교직원연금법 적용대상 재직 교직원 본인 및 자녀 대상 학자금 대여(대출). 국내: 실등록금 범위 내 / 해외: 연 USD 10,000 이내. 이중대여·중복수혜 불가.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '국고학자금' AND organization = '사립학교직원연금공단'
);

-- 12. 대하장학생 / 재단법인 대하장학회
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '대하장학생', '재단법인 대하장학회', '기타',
  ARRAY['생활비']::text[], 2000000,
  '2026-05-04', '2026-05-08', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','대학원']::text[],
  ARRAY['재학','휴학']::text[],
  '내국인',
  false,
  ARRAY['장학생 신청서','자기소개서','주민등록 등본 및 가족관계증명','재학증명 및 전 학년 성적증명','양 부모 소득증명 또는 연말 원천징수영수증 각 1부','통장 사본','총장추천서(해당자)']::text[],
  '다음카페(cafe.daum.net/deahamyung) 참고 후 신청',
  'https://cafe.daum.net/deahamyung/',
  'https://cafe.daum.net/deahamyung/',
  '본인 또는 부모가 명씨(明氏) 성을 가진 대학생 및 대학원 석·박사과정 재학생. 총 2회 초과 수혜 불가. 대학총장 추천 필요.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '대하장학생' AND organization = '재단법인 대하장학회'
);

-- 13. 장학생 / (재)한국로타리장학문화재단
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '장학생', '(재)한국로타리장학문화재단', '기타',
  ARRAY['생활비']::text[], 0,
  '2026-02-02', '2026-04-30', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대','대학원']::text[],
  ARRAY['재학','휴학']::text[],
  '내국인',
  true,
  ARRAY['신규장학생: 재학증명서(2026년 1월 이후)','추천서','자기소개서','수혜학생 또는 클럽 명의 통장사본','개인정보 활용동의서','계속장학생: 재학증명서(2026년 1월 이후)','수혜학생 또는 클럽 명의 통장사본']::text[],
  '클럽의 장학위원장(회장) 또는 학생의 지도교수 또는 기관 추천을 통해 접수',
  'http://www.rotarykorea.org',
  'http://www.rotarykorea.org',
  '클럽 장학위원장·지도교수·기관 등 추천서 필수. 타 장학금 수혜자 불가 (단, 학업지원비 명목 신청 시 중복 가능). 관명장학생은 관명인 추천서 갈음.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '장학생' AND organization = '(재)한국로타리장학문화재단'
);

-- 14. 새내기 지원금 / 경상남도 창원시청
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_enrollment_status, qual_region, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '새내기 지원금', '경상남도 창원시청', '지방자치단체',
  ARRAY['생활비']::text[], 1000000,
  '2026-03-03', '2026-04-30', NULL,
  ARRAY['재학','휴학']::text[],
  ARRAY['창원']::text[], '내국인',
  false,
  ARRAY['주민등록표 초본(최근 2년간 주소 변동사항 포함)','고등학교 졸업증명서(또는 검정고시 합격증명서)','통장사본(신입생 본인 명의)','신청서 및 개인정보 수집이용 및 제3자 제공 동의서','가족관계증명서']::text[],
  '해당 기관 홈페이지(www.changwon.go.kr) 및 담당기관 문의',
  'http://www.changwon.go.kr/main/main.jsp',
  'http://www.changwon.go.kr/main/main.jsp',
  '창원시 관내 고교 졸업, 2026년도 관내 대학 1학년 재학생. 2025.3.4 이후 창원시 전입자 제외. 1990.12.31 이전 출생자 제외. 대학(원)생 생활안정지원사업 수혜자 제외.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '새내기 지원금' AND organization = '경상남도 창원시청'
);

-- 15. 학자금대출이자지원 / 제주특별자치도청
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_region, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '학자금대출이자지원', '제주특별자치도청', '지방자치단체',
  ARRAY['기타']::text[], 0,
  '2026-01-28', '2026-04-30', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대','대학원']::text[],
  ARRAY['재학','휴학']::text[],
  ARRAY['제주']::text[], '내국인',
  false,
  ARRAY['대학(원) 재학/휴학증명서 또는 졸업증명서(중·자퇴·수료증명서)','행정정보공동이용 조회 및 개인정보 수집 이용 동의']::text[],
  '정부24(www.gov.kr) 온라인/모바일 신청',
  'https://www.jeju.go.kr',
  'https://www.jeju.go.kr',
  '2010년부터 한국장학재단을 통해 대출받은 취업 후 상환/일반상환 학자금·생활비 대출 이자 100% 지원(2025년 하반기 발생이자). 도내 주민등록(6개월 이전부터) 또는 도내 고교 졸업자.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '학자금대출이자지원' AND organization = '제주특별자치도청'
);

-- 16. 보훈장학금(대학원장학) / 국가보훈부
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_nationality, qual_special_info,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '보훈장학금(대학원장학)', '국가보훈부', '공공기관',
  ARRAY['등록금']::text[], 1300000,
  '2026-04-01', '2026-04-30', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['전문대','대학원']::text[],
  ARRAY['재학','휴학']::text[],
  '내국인',
  ARRAY['보훈대상자']::text[],
  false,
  ARRAY['보훈장학 신청서','개인정보 이용 및 제공 사전동의서','직전학기 성적증명서','재학증명서','수업료 납입증명서']::text[],
  '교육기관 소재지 관할 보훈(지)청 보훈과 방문 또는 등기우편 제출',
  'https://www.mpva.go.kr',
  'https://www.mpva.go.kr',
  '국가보훈법령에 따라 교육지원 받는 본인·배우자·자녀 포함 대상. 학기당 최고 130만원(실납부 수업료 이내). 대학원 정규 첫 학기 신입생·수업연한 초과자·연구과정·해외유학과정 제외.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '보훈장학금(대학원장학)' AND organization = '국가보훈부'
);

-- 17. 보훈장학금(특수교육장학) / 국가보훈부
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_nationality, qual_special_info,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '보훈장학금(특수교육장학)', '국가보훈부', '공공기관',
  ARRAY['등록금']::text[], 300000,
  '2026-04-01', '2026-04-30', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제']::text[],
  ARRAY['재학','휴학']::text[],
  '내국인',
  ARRAY['보훈대상자','장애인']::text[],
  false,
  ARRAY['보훈장학 신청서','개인정보 이용 및 제공 사전 동의서','특수교육대상자 배치 결과통지서']::text[],
  '교육기관 소재지 관할 보훈(지)청 보훈과 방문 또는 등기우편 제출',
  'https://www.mpva.go.kr',
  'https://www.mpva.go.kr',
  '보훈법령 교육지원대상자 중 특수교육법의 특수교육대상자. 특수학교 또는 일반학교 특수(일반)학급 재학 중인 자. 학기당 30만원.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '보훈장학금(특수교육장학)' AND organization = '국가보훈부'
);

-- 18. 보훈장학금(대학장학) / 국가보훈부
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_enrollment_status,
  qual_nationality, qual_special_info,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '보훈장학금(대학장학)', '국가보훈부', '공공기관',
  ARRAY['등록금']::text[], 1000000,
  '2026-04-01', '2026-04-30', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['재학','휴학']::text[],
  '내국인',
  ARRAY['보훈대상자']::text[],
  false,
  ARRAY['보훈장학신청서','개인정보 이용 및 제공 사전동의서','재학증명서','직전학기 성적증명서(신입생 생략)','수업료 납입증명서','주민등록등본','장학금 신청자 통장 사본','선발 우선순위 증빙자료(해당자)']::text[],
  '교육기관 소재지 관할 보훈(지)청 보훈과 방문 또는 등기우편 제출',
  'https://www.mpva.go.kr',
  'https://www.mpva.go.kr',
  '6·25 전몰군경자녀의 자녀(손자녀)로서 대학 재학 중인 자. 학기당 최고 100만원(실납부 수업료 이내). 수업연한 초과자 및 당해학기 본인 납부 수업료 없는 경우 제외.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '보훈장학금(대학장학)' AND organization = '국가보훈부'
);

-- 19. 학업장려대학생 / 재단법인논산시장학회
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_region, qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '학업장려대학생', '재단법인논산시장학회', '지방자치단체',
  ARRAY['생활비']::text[], 1500000,
  '2026-03-16', '2026-04-30', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제','전문대']::text[],
  ARRAY['재학','휴학']::text[],
  ARRAY['논산']::text[], '내국인',
  false,
  ARRAY['장학생 신청서 및 개인정보 수집 및 활용 동의서','주민등록등본(해당자)','주민등록초본(해당자)','가족관계증명서(해당자)','본인의 통장 사본','대학교 재학증명서','고등학교 졸업증명서(해당자)']::text[],
  '공고문 첨부 신청서 및 구비서류 지참하여 해당 접수처 방문 신청 (생애 첫 1회만 지급)',
  'http://www.nonsan.go.kr',
  'http://www.nonsan.go.kr',
  '정규대학교(2년제 포함) 신입생. 2003년 1월 1일 이후 출생자 중 고교 졸업 후 5년 미경과자. 본인 또는 부모 중 1명이라도 논산시 1년 이상 주민등록. 생애 첫 1회만 지급.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = '학업장려대학생' AND organization = '재단법인논산시장학회'
);

-- 20. ADF최재형장학생 / 아시아발전재단
INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_location, qual_school_category, qual_enrollment_status,
  qual_nationality,
  can_overlap, required_documents, apply_method,
  apply_url, homepage_url, note,
  selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  'ADF최재형장학생', '아시아발전재단', '기타',
  ARRAY['생활비']::text[], 2000000,
  '2026-04-01', '2026-04-30', NULL,
  ARRAY['국내 대학']::text[],
  ARRAY['4년제']::text[],
  ARRAY['재학','휴학']::text[],
  '내국인',
  false,
  ARRAY['신청서','자기소개 및 학업계획서','재학증명서','추천서']::text[],
  '고려인 관련 단체·교육기관 등 재직자(부모형제친인척 보호자 제외) 추천을 통해 접수',
  'https://www.asiadf.org',
  'https://www.asiadf.org',
  '고려인 관련 단체·교육기관 재직자 추천 필수. 기관별 최대 추천 6인 초과 시 지원서 무효 처리.',
  1, '서류심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships
  WHERE name = 'ADF최재형장학생' AND organization = '아시아발전재단'
);
