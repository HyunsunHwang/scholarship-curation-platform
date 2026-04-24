-- ──────────────────────────────────────────────────────────────────
-- 한국장학재단 공공데이터 기반 장학금 INSERT (2026-04-24 기준 유효)
-- 기존 장학금과 중복 방지: name + organization 으로 체크
-- ──────────────────────────────────────────────────────────────────

SELECT setval('public.scholarships_id_seq', (SELECT COALESCE(MAX(id),1) FROM public.scholarships));

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '장학생',
  '(재)한국로타리장학문화재단',
  '기타',
  ARRAY['생활비']::text[],
  0,
  '2026-02-02', '2026-04-30', NULL,
  ARRAY['4년제','전문대','대학원']::text[],
  NULL, NULL, NULL,
  true,
  '{"신규장학생","재학증명서(2026년 1월 이후)","추천서","자기소개서","수혜학생 또는 클럽 명의의 통장사본","개인정보 활용동의서","계속장학생","재학증명서(2026년 1월 이후)","수혜학생 또는 클럽 명의의 통장사본"}',
  '홈페이지 및 담당기관 문의',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 타 장학금 수혜자가 아닌 학생 (학업지원비로 신청할 경우 중복지원 가능/즉 생활비)',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '장학생' AND organization = '(재)한국로타리장학문화재단'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '새내기 지원금',
  '경상남도 창원시청',
  '지방자치단체',
  ARRAY['생활비']::text[],
  1000000,
  '2026-03-03', '2026-04-30', NULL,
  NULL,
  NULL, ARRAY['창원']::text[], NULL,
  false,
  '{"주민등록표 초본(최근 2년간 과거의 주소 변동사항 포함)","고등학교 졸업증명서(또는 검정고시 합격증명서)","통장사본(신입생 본인 명의)","신청서 및 개인정보 수집이용 및 제3자 제공 동의서","가족관계증명서"}',
  '홈페이지 및 담당기관 문의',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 1990.12.31 이전 출생자• 재학생이 아닌 경우• 학사과정이 아닌 경우• 대학(원)생 생활안정지원사업 등 유사사업 수혜자',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '새내기 지원금' AND organization = '경상남도 창원시청'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '대학재학장학금',
  '경상남도청',
  '지방자치단체',
  ARRAY['생활비']::text[],
  1000000,
  '2026-09-01', '2026-10-02', 100,
  NULL,
  NULL, NULL, 2.86666666666667,
  false,
  '{"장학금 신청서 1부","개인정보 수집이용 등 동의서 1부","주민등록등본 1부","대학교 재학증명서 1부","대학교 성적증명서 1부","고등학교 졸업증명서 또는 검정고시 합격증명서 1부","학자금 지원구간 통지서 1부"}',
  '○ 1차 시·군에서 정량적 심사 후 2차 장학회 이사/외부 전문가 등으로 심사위원회를 구성하여 선발',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 경상남도장학회 2025년 도내 대학 재학생 장학금 수해자 및 2026년 장학사업 중복 수혜자• 타 기관 생활비성 장학금 수혜자• 한 세대 1명만 선발',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '대학재학장학금' AND organization = '경상남도청'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '보훈장학금(대학원장학)',
  '국가보훈부',
  '공공기관',
  ARRAY['생활비']::text[],
  1300000,
  '2026-04-01', '2026-04-30', NULL,
  ARRAY['전문대','대학원']::text[],
  NULL, NULL, NULL,
  false,
  '{"보훈장학 신청서","개인정보 이용 및 제공 사전동의서","직전학기 성적증명서","재학증명서","수업료 납입증명서"}',
  '○ 신청인원이 선발인원보다 많은 경우 장학금 예산 범위 내에서 우선순위에 따라 선발※ 자세한 사항은 첨부파일 또는 홈페이지 참고',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 대학원 정규 첫 학기 신입생• 대학원 해당과정 수업연한 초과자 (수업연한에 포함되어 있는 논문학기 경우는 지원)• 연구과정 및 해외유학 과정',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '보훈장학금(대학원장학)' AND organization = '국가보훈부'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '보훈장학금(특수교육장학)',
  '국가보훈부',
  '공공기관',
  ARRAY['생활비']::text[],
  300000,
  '2026-04-01', '2026-04-30', NULL,
  ARRAY['4년제']::text[],
  NULL, NULL, NULL,
  false,
  '{"보훈장학 신청서","개인정보 이용 및 제공 사전 동의서","특수교육대상자 배치 결과통지서"}',
  '※ 신청인원이 선발인원보다 많은 경우 장학금 예산 범위 내에서 우선순위에 따라 선발※ 자세한 사항은 첨부파일 또는 홈페이지 참고',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  NULL,
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '보훈장학금(특수교육장학)' AND organization = '국가보훈부'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '보훈장학금(대학장학)',
  '국가보훈부',
  '공공기관',
  ARRAY['생활비']::text[],
  1000000,
  '2026-04-01', '2026-04-30', NULL,
  NULL,
  NULL, NULL, NULL,
  false,
  '{"보훈장학신청서","개인정보 이용 및 제공 사전동의서","재학증명서","직전학기 성적 증명서(신입생은 제출 생략)","수업료 납입증명서","주민등록등본","장학금 신청자의 통장 사본","선발 우선순위 증빙자료(해당자에 한함)"}',
  '○ 신청 인원이 선발인원보다 많은 경우 장학금 예산 범위 내에서 장학금 우선순위 선발기준에 따라 장학생 선발발',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 국가유공자의 전공사상 시기가 6·25전쟁이 아닌 경우• 재학 중인 학교의 학칙상 수업연한 초과자• 당해 학기에 본인이 납부한 수업료가 없는 경우(타 장학금 수령 포함)',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '보훈장학금(대학장학)' AND organization = '국가보훈부'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '대학생장학금',
  '(재)인제군장학회',
  '지방자치단체',
  ARRAY['생활비']::text[],
  5000000,
  '2026-01-19', '2026-12-04', NULL,
  ARRAY['4년제','전문대']::text[],
  NULL, ARRAY['인제군']::text[], 2.38888888888889,
  false,
  '{"장학생 지원서","주민등록등본","개인(신용)정보 수집·이용·제공 및 조회 동의서","재학증명서(신입생은 합격증명서 및 등록금 영수증 사본)","성적증명서(4.5만점 기준 성적표)","신입생은 고등학교 성적증명서(최종학년 1·2학기)"}',
  '○ 신청자 중 고득점자 순○ 저소득층·장애인의 자녀 및 예체능 특기자 우선 선발 후 일반 대학생 성적순 선발',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• (재)인제군장학회 장학금과의 중복지원 불가• 대학원생·원격대학·야간대학·외국대학·직장인 제외• 평생교육법에 의한 학점은행제 교육원 및 전문학교• 생활비를 지원받는 특수대학• 대학졸업예정자·휴학예정자·신청학기 성적으로 기 장학금을 지급받은 이력이 있는 자',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '대학생장학금' AND organization = '(재)인제군장학회'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '예/체능특기자장학금',
  '(재)인제군장학회',
  '지방자치단체',
  ARRAY['생활비']::text[],
  5000000,
  '2026-01-19', '2026-12-04', NULL,
  ARRAY['4년제','전문대']::text[],
  ARRAY['예체능계열']::text[], ARRAY['인제군']::text[], NULL,
  true,
  '{"장학생지원서","개인(신용)정보 수집·이용·제공 및 조회 동의서","주민등록등본","가족관계증명서","재학증명서","전년도 수상실적 증명서류 (상장 등)"}',
  '홈페이지 및 담당기관 문의',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• (재)인제군장학회 장학금과의 중복지원 불가능• 대학원생·원격대학·야간대학·외국대학·직장인• 평생교육법에 의한 학점은행제 교육원 및 전문학교• 생활비를 지원받는 특수대학• 대학졸업예정자·휴학예정자·신청학기 성적으로 기 장학금을 지급받은 이력이 있는 자',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '예/체능특기자장학금' AND organization = '(재)인제군장학회'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '학업장려대학생',
  '재단법인논산시장학회',
  '지방자치단체',
  ARRAY['생활비']::text[],
  1500000,
  '2026-03-16', '2026-04-30', NULL,
  ARRAY['4년제','전문대']::text[],
  NULL, ARRAY['논산']::text[], NULL,
  false,
  '{"장학생 신청서 및 개인정보 수집 및 활용 동의서","주민등록등번(해당자)","주민등록초본(해당자)","가족관계증명서(해당자)","본인의 통장 사본","대학교 재학증명서","고등학교 졸업증명서(해당자)"}',
  '○ 공고문에 첨부된 신청서 및 기타 구비서류 지참하여 해당 접수처에 방문 신청○ 생애 첫1회만 지급 가능',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  NULL,
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '학업장려대학생' AND organization = '재단법인논산시장학회'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '남원의 별 특별장학생',
  '춘향장학재단',
  '지방자치단체',
  ARRAY['생활비']::text[],
  500000,
  '2026-01-26', '2026-12-31', NULL,
  ARRAY['4년제','전문대','대학원']::text[],
  NULL, ARRAY['남원']::text[], NULL,
  false,
  '{"남원의 별 특별장학금 지원 신청서","수상 증명 자료","대회 요강 자료","개인정보 제공 및 활용 동의서"}',
  '○ 대상자 본인이 각 분야별 제출서류 및 증빙자료 첨부하여 접수○ 수상실적이 여러 건인 경우 대회 등급별 최고 성적으로 접수○ 춘향장학재단 운영위원회 심의를 통한 장학생 선정',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 동일종목 및 동일수상실적으로 춘향인재장학금과 중복 지급 불가',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '남원의 별 특별장학생' AND organization = '춘향장학재단'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  'SOS 장학금',
  '영천시장학회',
  '지방자치단체',
  ARRAY['생활비']::text[],
  1000000,
  '2025-12-24', '2026-12-31', 20,
  NULL,
  NULL, ARRAY['영천']::text[], NULL,
  false,
  '{"신청서(별지1)","개인정보동의서(별지3)","주민등록등본 또는 초본 (1년 이상 관내 거주 여부 확인이 가능하도록 발급)","화재증명원/재해피해확인서/가족관계증명서(주 양육자의사망 확인) 등 증빙자료","대학생은 재학증명서도 첨부"}',
  '○ 장학위원회/(재)영천시장학회 이사회 의결을 거쳐 선발',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 당해연도 내 동일인 중복 지급 불가',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = 'SOS 장학금' AND organization = '영천시장학회'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '배려대상자',
  '(재)호국장학재단',
  '기타',
  ARRAY['생활비']::text[],
  1000000,
  '2026-03-03', '2026-06-30', 400,
  ARRAY['4년제','전문대']::text[],
  NULL, NULL, 1.91111111111111,
  false,
  '{"호국장학금 신청서","개인정보수집·이용·제공 및 조회/ 학자금 중복지원 방지 동의서","성적증명서","(국외대학생) 입학허가서","(26년 1학기 복학생/교환학생) 학적부","26년 1학기 등록확인서 또는 등록금 납입증명서","신청인 본인 가족관계증명서","배려대상자 신청시 증빙서류 제출","신청인 본인명의 입출금식 통장","복무확인서 또는 재직증명서"}',
  '홈페이지 및 담당기관 문의',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 국고지원 대학 또는 등록금 실 납부액이 100만원 미만자는 중복지원 금지• 정규학기 초과등록자/동일한 년도(학기) 성적으로 기 장학금 수혜자/''26년 9월 이전 졸업자는 대상에서 제외• 방송통신대학/사내대학/국비대학/2년 미만 교육과정 등 지급제외',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '배려대상자' AND organization = '(재)호국장학재단'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '성적우수자',
  '(재)호국장학재단',
  '기타',
  ARRAY['생활비']::text[],
  1000000,
  '2026-03-03', '2026-06-30', 600,
  ARRAY['4년제','전문대']::text[],
  NULL, NULL, 3.91777777777778,
  false,
  '{"호국장학금 신청서","개인정보수집·이용·제공 및 조회/학자금 중복지원 방지 동의서","성적증명서","(국외대학생) 입학허가서","(25년 1학기 복학생/교환학생) 학적부","26년 1학기 등록확인서 또는 등록금 납입증명서","신청인 본인 가족관계증명서","신청인 본인명의 입출금식 통장","복무확인서 또는 재직증명서"}',
  '홈페이지 및 담당기관 문의',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 정규학기 초과등록자/동일한 년도(학기) 성적으로 기 장학금 수혜자/''26 9월 이전 졸업자는 대상에서 제외• 방송통신대학/사내대학/국비대학/2년 미만 교육과정의 학교 등은 선발 제외',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '성적우수자' AND organization = '(재)호국장학재단'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '석성장학생',
  '재단법인 석성장학회',
  '기타',
  ARRAY['생활비']::text[],
  1000000,
  '2026-02-01', '2026-11-30', NULL,
  ARRAY['4년제']::text[],
  NULL, NULL, NULL,
  false,
  '{"장학금 수혜지원서","학교장 또는 관련 단체장 추천서","개인정보 동의서","주민등록초본","통장사본(현금 지급 희망시)"}',
  '홈페이지 및 담당기관 문의',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 학자금대출과 타 장학금이 해당 학기 등록금을 초과시 제외',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '석성장학생' AND organization = '재단법인 석성장학회'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '특별장학생',
  '재단법인 석성장학회',
  '기타',
  ARRAY['생활비']::text[],
  1000000,
  '2026-02-01', '2026-11-30', NULL,
  NULL,
  NULL, NULL, NULL,
  false,
  '{"장학금 수혜지원서","학교장 또는 관련 단체장 추천서","개인정보 수집 및 이용 동의서","주민등록초본","(해당자) 현금 지급 사유서 및 통장 사본"}',
  '홈페이지 및 담당기관 문의',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 한국장학재단 중복심사 결과 결격 사유가 없어야 함',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '특별장학생' AND organization = '재단법인 석성장학회'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '성적우수장학생',
  '에코랜드',
  '기타',
  ARRAY['생활비']::text[],
  3000000,
  '2026-04-13', '2026-04-24', 200,
  ARRAY['4년제','전문대']::text[],
  NULL, ARRAY['청학리']::text[], NULL,
  false,
  '{"장학생선발 추천서","주민등록등본","주민등록초본","1·2학기 성적증명서","등록금 납입증명서","장학금수혜(비수혜)확인서","기타 필요하다고 인정되는 자료(해당자)"}',
  '홈페이지 및 담당기관 문의',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 방송통신대학 및 사이버 대학 재학생• 학점은행제학위수여 과정자• 장학생 신청자격 비대상자• 공고일 현재 휴학·유학·군 입대 등으로 학업을 계속하기 곤란한 자• 주변지역 이외로 거주지를 이전한 자• 국가·지방자치단체·기타 장학재단 등 모든 기관으로부터 전액장학금을 받는 자',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '성적우수장학생' AND organization = '에코랜드'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '복지장학생',
  '에코랜드',
  '기타',
  ARRAY['생활비']::text[],
  3000000,
  '2026-04-13', '2026-04-24', 200,
  ARRAY['4년제','전문대']::text[],
  NULL, ARRAY['청학리']::text[], NULL,
  false,
  '{"장학생선발 추천서","주민등록등본","주민등록초본","재학증명서","초·중 졸업증명서","기초생활수급자증명서 또는 차상위계층증명서(해당자)","건강보험료 납입증명서 및 건강보험 자격득실확인서 및 지방세 세목별 과세증명서(해당자)","2025년 1학기 등록금 납입증명서"}',
  '○ ''주민지원협의체위원회''에서 주변지역 거주기간/주변지역 내 학교 졸업여부/학업성적/가정형편 등을 종합평가하여 총 배점 순위에 따라 심의를 거쳐 선발',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 방송통신대학 및 사이버 대학 재학생• 학점은행제학위수여 과정자• 장학생 신청자격 비대상자• 공고일 현재 휴학·유학·군 입대 등으로 학업을 계속하기 곤란한 자• 주변지역 이외로 거주지를 이전한 자',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '복지장학생' AND organization = '에코랜드'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '예/체능특기장학생',
  '에코랜드',
  '기타',
  ARRAY['생활비']::text[],
  3000000,
  '2026-04-13', '2026-04-24', 200,
  ARRAY['4년제','전문대']::text[],
  NULL, ARRAY['청학리']::text[], NULL,
  false,
  '{"장학생선발 추천서","주민등록등본","주민등록초본","재학증명서","초·중 졸업증명서","2025년 특기성적증명서","2026년 1학기 등록금 납입증명서(대학생)","기타 필요하다고 인정되는 자료(해당자)"}',
  '○ ''주민지원협의체위원회''에서 주변지역 거주기간/주변지역 내 학교 졸업여부/학업성적/가정형편 등을 종합평가하여 총 배점 순위에 따라 심의를 거쳐 선발',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 방송통신대학 및 사이버 대학 재학생• 학점은행제학위수여 과정자• 장학생 신청자격 비대상자• 공고일 현재 휴학·유학·군 입대 등으로 학업을 계속하기 곤란한 자• 주변지역 이외로 거주지를 이전한 자• 국가·지방자치단체·기타 장학재단 등 모든 기관으로부터 전액장학금을 받는 자',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '예/체능특기장학생' AND organization = '에코랜드'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  '대하장학생',
  '재단법인 대하장학회',
  '기타',
  ARRAY['생활비']::text[],
  2000000,
  '2026-05-04', '2026-05-08', NULL,
  ARRAY['4년제','대학원']::text[],
  NULL, NULL, NULL,
  false,
  '{"장학생 신청서","자기소개서","주민등록 등본 및 가족관계증명","재학증명 및 전 학년 성적증명","양 부모의 소득증명 또는 연말 원천징수영수증 각 1부","통장 사본","총장추천서 (해당자)"}',
  '※ 자세한 사항은 첨부파일 또는 홈페이지 참고',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 장학금 수혜는 총 2회를 초과할 수 없음',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = '대하장학생' AND organization = '재단법인 대하장학회'
);

INSERT INTO public.scholarships (
  name, organization, institution_type, support_types, support_amount,
  apply_start_date, apply_end_date, selection_count,
  qual_school_category, qual_major, qual_region, qual_gpa_min,
  can_overlap, required_documents, apply_method, apply_url,
  homepage_url, note, selection_stages, selection_stage_1,
  collected_at, is_verified, list_on_home
)
SELECT
  'ADF최재형장학생',
  '아시아발전재단',
  '기타',
  ARRAY['생활비']::text[],
  2000000,
  '2026-04-01', '2026-04-30', NULL,
  ARRAY['4년제']::text[],
  NULL, NULL, NULL,
  false,
  '{"신청서","자기소개 및 학업계획서","재학증명서","추천서"}',
  '○ 심사※ 자세한 사항은 첨부파일 또는 홈페이지 참고',
  'https://www.kosaf.go.kr/ko/scholarship.do',
  NULL,
  '• 기관별 최대 추천 장학생 수 6인부터는 지원서 무표처리',
  1, '서류 심사',
  NOW(), false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships WHERE name = 'ADF최재형장학생' AND organization = '아시아발전재단'
);

