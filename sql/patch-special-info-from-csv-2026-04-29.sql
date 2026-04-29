-- CSV 장학금_DB (6) 기준: 접수마감일이 지나지 않은 기존 DB 장학금의 자격_특수정보 정리
-- 적용 기준일: 2026-04-29 (Asia/Seoul)
-- 상세 페이지 지원자격 > 기타 요건에 표시되도록 scholarships.qual_special_info(text[])에 반영합니다.

-- 자유서술형 특수요건을 담기 위해 장학금 쪽 qual_special_info를 text[]로 전환합니다.
-- profiles.special_info는 기존 special_info_type[] 그대로 유지합니다.
ALTER TABLE public.scholarships
  ALTER COLUMN qual_special_info TYPE text[]
  USING CASE
    WHEN qual_special_info IS NULL THEN NULL
    ELSE qual_special_info::text[]
  END;

-- 맞춤 매칭에서는 qual_special_info 중 프로필 enum 값과 정확히 일치하는 항목만 hard condition으로 사용합니다.
-- 그 외 자유서술형 문구는 상세 페이지 표시용으로만 취급하여 매칭을 막지 않습니다.
CREATE OR REPLACE FUNCTION public.get_matched_scholarships(p_user_id uuid)
 RETURNS SETOF scholarships
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH profile AS (
    SELECT
      p.*,
      u.name   AS resolved_university_name,
      ud.name  AS resolved_department_name,
      ud2.name AS resolved_double_major_name,
      uc.name  AS resolved_college_name,
      uc2.name AS resolved_double_major_college_name
    FROM public.profiles p
    LEFT JOIN public.universities          u   ON u.id   = p.university_id
    LEFT JOIN public.university_departments ud  ON ud.id  = p.department_id
    LEFT JOIN public.university_departments ud2 ON ud2.id = p.double_major_department_id
    LEFT JOIN public.university_colleges    uc  ON uc.id  = p.college_id
    LEFT JOIN public.university_colleges    uc2 ON uc2.id = p.double_major_college_id
    WHERE p.id = p_user_id
  )
  SELECT s.*
  FROM public.scholarships s
  CROSS JOIN profile p
  WHERE (auth.uid() = p_user_id OR public.is_admin())
    AND s.is_verified = true
    AND (
      s.apply_end_date = '9999-12-31'
      OR s.apply_end_date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date
    )
    AND (
      s.qual_university IS NULL
      OR cardinality(s.qual_university) = 0
      OR (p.resolved_university_name IS NOT NULL AND p.resolved_university_name = ANY(s.qual_university))
      OR (p.school_name IS NOT NULL AND p.school_name = ANY(s.qual_university))
    )
    AND (
      s.qual_school_location IS NULL
      OR cardinality(s.qual_school_location) = 0
      OR p.school_location = ANY(s.qual_school_location)
    )
    AND (
      s.qual_school_category IS NULL
      OR cardinality(s.qual_school_category) = 0
      OR p.school_category = ANY(s.qual_school_category)
    )
    AND (
      s.qual_enrollment_status IS NULL
      OR cardinality(s.qual_enrollment_status) = 0
      OR p.enrollment_status = ANY(s.qual_enrollment_status)
    )
    AND (
      s.qual_academic_year IS NULL
      OR cardinality(s.qual_academic_year) = 0
      OR p.academic_year = ANY(s.qual_academic_year)
    )
    AND (
      s.qual_min_academic_year IS NULL
      OR p.enrollment_status IN ('졸업예정'::public.enrollment_status_type, '졸업'::public.enrollment_status_type)
      OR (
        p.academic_year IS NOT NULL
        AND (
          p.academic_year > s.qual_min_academic_year
          OR (
            p.academic_year = s.qual_min_academic_year
            AND (
              s.qual_min_academic_semester IS NULL
              OR (p.academic_semester IS NOT NULL AND p.academic_semester >= s.qual_min_academic_semester)
            )
          )
        )
      )
    )
    AND (
      s.qual_major IS NULL
      OR cardinality(s.qual_major) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(s.qual_major) AS m
        WHERE
          (p.resolved_department_name IS NOT NULL AND (p.resolved_department_name ILIKE '%' || m || '%' OR m ILIKE '%' || p.resolved_department_name || '%'))
          OR (p.department IS NOT NULL AND (p.department ILIKE '%' || m || '%' OR m ILIKE '%' || p.department || '%'))
          OR (p.resolved_college_name IS NOT NULL AND (p.resolved_college_name ILIKE '%' || m || '%' OR m ILIKE '%' || p.resolved_college_name || '%'))
          OR (p.resolved_double_major_name IS NOT NULL AND (p.resolved_double_major_name ILIKE '%' || m || '%' OR m ILIKE '%' || p.resolved_double_major_name || '%'))
          OR (p.double_major_department IS NOT NULL AND (p.double_major_department ILIKE '%' || m || '%' OR m ILIKE '%' || p.double_major_department || '%'))
          OR (p.resolved_double_major_college_name IS NOT NULL AND (p.resolved_double_major_college_name ILIKE '%' || m || '%' OR m ILIKE '%' || p.resolved_double_major_college_name || '%'))
      )
    )
    AND (s.qual_gpa_min IS NULL OR (p.gpa IS NOT NULL AND p.gpa >= s.qual_gpa_min))
    AND (s.qual_gpa_last_semester_min IS NULL OR (p.gpa_last_semester IS NOT NULL AND p.gpa_last_semester >= s.qual_gpa_last_semester_min))
    AND (
      s.qual_income_level_max IS NULL
      OR (p.income_level IS NOT NULL AND p.income_level <= s.qual_income_level_max AND p.income_level >= COALESCE(s.qual_income_level_min, 1))
    )
    AND (s.qual_household_size_max IS NULL OR (p.household_size IS NOT NULL AND p.household_size <= s.qual_household_size_max))
    AND (s.qual_gender IS NULL OR p.gender = s.qual_gender)
    AND (s.qual_age_min IS NULL OR (p.birth_date IS NOT NULL AND DATE_PART('year', AGE((p.birth_date)::date)) >= s.qual_age_min))
    AND (s.qual_age_max IS NULL OR (p.birth_date IS NOT NULL AND DATE_PART('year', AGE((p.birth_date)::date)) <= s.qual_age_max))
    AND (
      s.qual_region IS NULL
      OR cardinality(s.qual_region) = 0
      OR (p.address IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(s.qual_region) AS r WHERE p.address ILIKE '%' || r || '%'))
    )
    AND (s.qual_nationality IS NULL OR p.nationality = s.qual_nationality)
    AND (
      s.qual_special_info IS NULL
      OR cardinality(s.qual_special_info) = 0
      OR NOT EXISTS (
        SELECT 1 FROM unnest(s.qual_special_info) AS req
        WHERE req = ANY(enum_range(NULL::public.special_info_type)::text[])
      )
      OR (p.special_info IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(s.qual_special_info) AS req
        WHERE req = ANY(p.special_info::text[])
      ))
    )
    AND (s.qual_parent_occupation IS NULL OR cardinality(s.qual_parent_occupation) = 0 OR (p.parent_occupation IS NOT NULL AND p.parent_occupation && s.qual_parent_occupation))
    AND (s.qual_military_status IS NULL OR p.military_status = s.qual_military_status)
  ORDER BY s.apply_end_date ASC;
$function$;

WITH csv_special(csv_id, name, organization, special) AS (
VALUES
  ('KU-008', '2026-1학기 오픈캠퍼스장학생', '고려대학교', ARRAY['성북구민의 자녀']::text[]),
  ('IC-001', '2026년도 인천광역시 대학생 해외연수 장학생 선발', '(재)인천인재평생교육진흥원 / 인천광역시', ARRAY['[사회적배려대상] 본인이 기초생활수급자·차상위계층·한부모가족·자립준비청년·다문화가정·국가유공자 중 1개 이상 해당자 우대']::text[]),
  ('HM-001', '2026 현대차 정몽구 스칼러십 - 과학기술 스칼러십', '현대차 정몽구 재단', NULL::text[]),
  ('HM-002', '2026 현대차 정몽구 스칼러십 - 문화예술 스칼러십 (대학생)', '현대차 정몽구 재단', NULL::text[]),
  ('KU-029', '2026학년도 공과대학 이문치 장학금', '고려대학교 공과대학', NULL::text[]),
  ('KU-036', '2026학년도 가정교육과 선배 장학금', '고려대학교 가정교육과', NULL::text[]),
  ('DS-001', '2026년 달서인재육성장학재단 진학장학생', '(재)달서인재육성장학재단', NULL::text[]),
  ('HM-003', '2026년 상반기 현대모비스 장학전환인턴', '현대모비스', NULL::text[]),
  ('KU-040', '2026학년도 1학기 자유전공학부 기금(후배사랑)장학금', '고려대학교 자유전공학부', NULL::text[]),
  ('WM-001', '2026년 우리다문화장학재단 장학생 - 다문화자녀 학업장학(대학)', '우리다문화장학재단 (우리금융그룹)', ARRAY['다문화가족 자녀 (결혼이민자와 대한민국 국적자로 구성된 가족의 자녀. 부모 모두 외국 국적 및 새터민 불가)']::text[]),
  ('KA-001', '2026년 예술활동준비금 지원사업', '한국예술인복지재단', ARRAY['「예술인 복지법」상 예술활동증명 완료자 (공고일 기준 유효). 신진예술인 예술활동증명 등 일부 특례 완료자는 참여 제한.']::text[]),
  ('KC-001', '2026년 예비 건설엔지니어 장학금 (한국건설기술인협회)', '한국건설기술인협회', ARRAY['건설산업재해 피해 자녀(부 또는 모) 또는 한국건설기술인협회 정회원 자녀(부 또는 모)']::text[]),
  ('HN-001', '2026학년도 형남진장학재단 장학생', '형남진장학재단', NULL::text[]),
  ('KU-032', '2026학년도 역사교육과 진리장학 프로그램 - 역사대화2026 (제9회 한일 청소년 대학생 역사대화)', '고려대학교 역사교육과', NULL::text[]),
  ('KU-033', '2026학년도 1학기 건축학과 김지완 희망 장학금', '고려대학교 건축학과', NULL::text[]),
  ('KU-034', '2026학년도 1학기 건축학과 김도엽 장학금', '고려대학교 건축학과', NULL::text[]),
  ('KU-039', '2026학년도 1학기 자유전공학부 자전 교우 상생 장학금', '고려대학교 자유전공학부', NULL::text[]),
  ('KU-041', '2026학년도 1학기 자유전공학부 면학 장학금', '고려대학교 자유전공학부', NULL::text[]),
  ('KU-042', '2026학년도 1학기 자유전공학부 자몽에이드 장학금', '고려대학교 자유전공학부', NULL::text[]),
  ('IC-004', '2026년도 상반기 인천인희망드림 장학생', '(재)인천인재평생교육진흥원', ARRAY['기초생활수급자, 차상위계층, 한부모가정, 중증장애인']::text[]),
  ('IC-005', '2026년도 다자녀 가정지원 장학생', '(재)인천인재평생교육진흥원', ARRAY['다자녀 가정(2자녀 이상)']::text[]),
  ('IC-006', '2026년도 재외동포 자녀지원 장학생', '(재)인천인재평생교육진흥원', NULL::text[]),
  ('IC-007', '2026년도 인천대교 희망 장학생', '(재)인천인재평생교육진흥원', ARRAY['기초생활수급자, 차상위계층, 한부모가정, 중증장애인']::text[]),
  ('IC-008', '2026년도 iHUG 인천도시공사 장학생', '(재)인천인재평생교육진흥원', ARRAY['인천도시공사 임대주택(영구·국민임대·매입임대) 거주자']::text[]),
  ('KB-001', '2026 카카오뱅크 스칼라십', '유플러스핀테크 / 카카오뱅크', ARRAY['경제적 어려움이 있는 자 (가구 소득인정액 기준 중위소득 100% 이하)']::text[]),
  ('YS-009', '2026학년도 송석 임익순 장학금', '연세대학교 경영대학', NULL::text[]),
  ('SN-001', '2026년도 니토리 국제장학재단 장학생 (대학생)', '니토리 국제장학재단', NULL::text[]),
  ('SN-002', '2026년도 니토리 국제장학재단 장학생 (유학생)', '니토리 국제장학재단', NULL::text[]),
  ('KU-011', '2026학년도 1학기 고경면학장학금 2차', '고려대학교 경영대학', NULL::text[]),
  ('KU-012', '2026학년도 진리프로그램 장학금 (미디어학부)', '고려대학교 미디어학부', NULL::text[]),
  ('KU-030', '2026학년도 1학기 전기전자공학부 기금장학금 (남촌·유희붕·김봉주)', '고려대학교 전기전자공학부', NULL::text[]),
  ('KU-031', '2026학년도 1학기 전기전자공학부 선효(旋孝) 장학금', '고려대학교 전기전자공학부', NULL::text[]),
  ('YS-013', '2026-1 DB김준기문화재단 교육발전지원금 장학생', 'DB김준기문화재단', NULL::text[]),
  ('MA-002', '제35기 미래에셋 해외교환 장학생 (2026년 가을학기 파견)', '미래에셋박현주재단', ARRAY['2026년 가을학기 모교 해외교환(교류) 학생으로 재학 중 최초 선발(예정) 필수', '모교-파견교 간 교류협정 체결 필수', '파견교 정규학기 3개월(12주) 이상 수학', '과거 모교 정규학기에 교환학생 성격 해외파견 경험 있는 경우 지원 불가', '가산점: 기초생활수급자·차상위·장애인가정·국가유공자 자녀']::text[]),
  ('KF-001', '2026년 대통령과학장학금 국내 신규장학생 (일반 - 1학년)', '한국장학재단', ARRAY['기초생활수급자는 생활비 250만원/학기 추가 지원']::text[]),
  ('KF-002', '2026년 대통령과학장학금 국내 신규장학생 (일반 - 3학년)', '한국장학재단', ARRAY['기초생활수급자는 생활비 250만원/학기 추가 지원']::text[]),
  ('KF-003', '2026년 대통령과학장학금 국내 신규장학생 (지역추천 - 1학년)', '한국장학재단', ARRAY['시·도 교육감 추천자에 한해 별도 신청 안내. 기초생활수급자는 생활비 250만원/학기 추가 지원']::text[]),
  ('YS-008', '2026년 1학기 DB김준기문화재단 교육발전지원금 장학생', 'DB김준기문화재단', NULL::text[]),
  ('KU-013', '2026학년도 국가미래인재장학금', '고려대학교 학생처 SSC', NULL::text[]),
  ('KU-038', '2026학년도 1학기 글로벌한국융합학부 성재(誠齋)장학금', '고려대학교 글로벌한국융합학부', NULL::text[]),
  ('YS-011', '2026학년도 동문장학생 (72학번 전자/전기공학과)', '연세대학교 전기전자공학부 동문회', NULL::text[]),
  ('NS-002', '2026년 논산시장학회 장학금 - 지역대학진학 장학금 (관내 대학 신입생)', '(재)논산시장학회', ARRAY['관내 대학 학장/총장의 추천 필수. 학업장려 장학금과 중복 신청 불가']::text[]),
  ('KU-027', '2026학년도 1학기 통계학과 남명장학금', '고려대학교 통계학과', NULL::text[]),
  ('KU-028', '2026학년도 1학기 통계65 김민경 장학금', '고려대학교 통계학과', NULL::text[]),
  ('YS-001', '2026-1 DB김준기문화재단 교육발전지원금 장학생', 'DB김준기문화재단', NULL::text[]),
  ('YS-003', '김형기 장학금', '연세대학교 독어독문학과', NULL::text[]),
  ('YS-010', '2026-1 DB김준기문화재단 교육발전지원금 장학생', 'DB김준기문화재단', NULL::text[]),
  ('YS-012', '2026년 삼양이건미래인재 장학생', '삼양이건장학재단', NULL::text[]),
  ('KU-035', '2026학년도 차세대통신학과 NEXTERS 연구장학 프로그램', '고려대학교 차세대통신학과', NULL::text[]),
  ('YS-004', '2026학년도 신동욱 해외유학 장학생', '연세대학교 대학원', ARRAY['국내 학·석사 취득자 및 해외 1년 이상 연구 계획자']::text[]),
  ('YS-014', '2026-1학기 DB김준기문화재단 교육발전지원금 장학금', 'DB김준기문화재단', NULL::text[]),
  ('YS-015', '2026-1학기 DB김준기문화재단 교육발전지원금 장학생', 'DB김준기문화재단', NULL::text[]),
  ('KU-037', '2026학년도 가정교육과 진리장학금', '고려대학교 가정교육과', NULL::text[]),
  ('GW-001', '2026 강원랜드 멘토링 장학', '(주)강원랜드', ARRAY['온라인 멘토링 가능자']::text[]),
  ('KU-001', '2026학년도 1학기 KU Pride Club 생활비 장학금 (일반유형)', '고려대학교', ARRAY['인성이 훌륭하여 타에 모범이 되며 국가와 인류사회에 기여하는 것을 중요한 가치로 삼는 자. 기초생활수급자는 미래로장학금 신청 권장']::text[]),
  ('KU-002', '2026학년도 1학기 KU Pride Club 생활비 장학금 (특별유형)', '고려대학교', ARRAY['인성이 훌륭하여 타에 모범이 되며 국가와 인류사회에 기여하는 것을 중요한 가치로 삼는 체육특기자. 기초생활수급자는 미래로장학금 신청 권장']::text[]),
  ('KU-003', '2026-1학기 미래로장학금 2차', '고려대학교', ARRAY['기초생활수급자(생계·의료급여 수급자)는 생활비장학금(학기당 180만원) 및 기숙사장학금 추가 지급 가능']::text[]),
  ('KU-004', '2026-1학기 재해극복장학금', '고려대학교', ARRAY['2025-2학기~2026-1학기(2025.09.01~) 발생 자연재해(수해, 태풍 등) 피해 학생']::text[]),
  ('KU-005', '2026-1학기 소망장학금', '고려대학교', ARRAY['특수교육대상자 전형 입학자 또는 장애인 학생']::text[]),
  ('KU-006', '2026-1학기 드림장학금', '고려대학교', ARRAY['다문화가정: 부모 중 1인 이상 한국에 귀화한 다문화 가정 자녀']::text[]),
  ('KU-007', '2026-1학기 고대가족장학금', '고려대학교', ARRAY['형제·자매가 동시에 고려대 재학(대학원 포함) 중인 서울캠퍼스 학부생 1인']::text[]),
  ('KU-009', '2026-1학기 Essor(飛翔) 장학금 (A유형)', '고려대학교', ARRAY['직전학기 성적경고 해제자 (직전학기 이전학기 성적경고를 받은 자 중 직전학기 평점평균 1.75 이상인 자)']::text[]),
  ('KU-010', '2026-1학기 Essor(飛翔) 장학금 (B유형)', '고려대학교', ARRAY['직전학기 성적경고 해제자 (직전학기 이전학기 성적경고를 받은 자 중 직전학기 평점평균 1.75 이상인 자)']::text[]),
  ('BH-001', '2026년 1학기 보훈 장학 - 대학원 (석·박사과정)', '한국보훈복지의료공단 / 국가보훈처', ARRAY['국가유공자·보훈보상대상자·지원대상자·고엽제후유의증환자·5·18민주유공자·특수임무유공자 관련 대상자 (상세 대상 공고문 참조). 선발 우선순위: ①1~7급 상이자 본인 ②비상이자 본인 ③배우자·자녀 순']::text[]),
  ('BH-003', '2026년 1학기 보훈가족 장학 - 대학 (6·25전몰군경자녀의 자녀)', '한국보훈복지의료공단 / 국가보훈처', ARRAY['1953.7.27. 이전 또는 참전유공자 예우법 별표 전투기간 중 전사·순직한 국가유공자의 손자녀(수권자가 자녀가 아닌 경우 제외). 선발 우선순위: ①저소득자 ②6·25전몰유자녀가 대학교육지원 미수혜 ③수혜자 순']::text[]),
  ('SR-001', '2026년 수림재단 이공계 장학금', '수림재단', ARRAY['학교장 추천 필수', '국가장학금 및 대학장학금 수혜자도 지원 가능']::text[]),
  ('BW-001', '2026년 백운장학회 대학생 생활비 장학금', '(재)백운장학회', ARRAY['자립준비청년 등 부모·보호자 없는 경우 부모 거주 기준 제외. 국가공무원·소방·경찰 등 직업 특성상 타 지역 발령 시 예외 인정']::text[]),
  ('NS-001', '2026년 논산시장학회 장학금 - 학업장려 장학금 (대학 신입생)', '(재)논산시장학회', ARRAY['생활비 지원 장학금으로 타 기관 장학금과 중복 지급 가능. 1인 1회만 지급 (재입학·편입 시 불가). 특수학교·경찰대·사관학교·간호사관학교 제외']::text[]),
  ('NS-003', '2026년 논산시장학회 장학금 - 사회적배려 장학금 (대학생)', '(재)논산시장학회', ARRAY['사회적 취약계층 (소년소녀가장·조손·장애인 가구·한부모·위탁가정·드림스타트·아동양육시설 거주 경험자·소상공인 등 경제적 위기가정)', '논산시 관련 기관·부서장의 추천 필수']::text[]),
  ('SB-001', 'M.A. Track in Korean Humanism - Full Tuition Scholarship (2026 Fall)', 'Stony Brook University', NULL::text[]),
  ('KU-025', '2026학년도 화학과 진리장학금 프로그램', '고려대학교 화학과', NULL::text[]),
  ('YS-006', '블루버터플라이 Entrepreneur Track 3기', '(재)연경장학회', ARRAY['창업 아이디어 보유자, 지도교수 및 멘토 2명 이상 확보 필수 (팀 단위 지원)']::text[]),
  ('SL-001', '2026년 서울런 동행멘토단', '서울특별시', ARRAY['교대/사범대/예체능 전공 우대, 서울런 이력 우대']::text[]),
  ('IC-001', '2026년 인천형 공공간호사 장학생 선발', '인천광역시의료원', ARRAY['인천광역시의료원 2년 의무 근무, 지도교수 추천 필수']::text[]),
  ('KJ-001', '2026년 한·일 대학생 연수', '한국장학재단', ARRAY['참여대학(삼육대/연성대/남서울대/한국영상대/구미대/동의대/부산외대/동신대) 소속 한정, JLPT N3 또는 JPT 430점 이상']::text[]),
  ('PS-001', '2026년 파란사다리', '한국장학재단', ARRAY['참여대학 재학생 또는 권역별 주관대학 추천을 받은 타교생']::text[]),
  ('KOSAF-26M-001', '장학생', '(재)한국로타리장학문화재단', ARRAY['대학(원)생 : 국내외 학교/내외국인 학생 모두 가능', '[제한] 타 장학금 수혜자가 아닌 학생 (학업지원비로 신청할 경우 중복지원 가능/즉 생활비)']::text[]),
  ('KOSAF-26M-002', '새내기 지원금', '경상남도 창원시청', ARRAY['창원시 관내 고교를 졸업하고 2026년도에 관내 대학에 1학년으로 재학 중인 자자', '[제한] 1990.12.31 이전 출생자', '재학생이 아닌 경우', '학사과정이 아닌 경우', '대학(원)생 생활안정지원사업 등 유사사업 수혜자']::text[]),
  ('KOSAF-26M-004', '학자금대출이자지원', '제주특별자치도청', ARRAY['공고일 기준 국내 대학(원) 재학생/휴학생/졸업(중·자퇴 포함) 후 10년 이내의 미취업자', '[제한] ※ 기관확인필요']::text[]),
  ('KOSAF-26M-006', '보훈장학금(대학원장학)', '국가보훈부', ARRAY['국가보훈법령에 따라 교육지원을 받는 본인·배우자·자녀', '국가유공자 본인', '전몰/순직군경/순직공무원/4·19혁명사망자/국가사회발전특별공조순직자의 배우자', '고엽제후유의증환자(수당대상자) 본인', '5.18민주운동부상자 본인/사망·행방불명자의 배우자 등', '[제한] 대학원 정규 첫 학기 신입생', '대학원 해당과정 수업연한 초과자 (수업연한에 포함되어 있는 논문학기 경우는 지원)', '연구과정 및 해외유학 과정']::text[]),
  ('KOSAF-26M-007', '보훈장학금(특수교육장학)', '국가보훈부', ARRAY['보훈법령에 의한 교육지원대상자 중「장애인 등에 대한 특수교육법」의 특수교육대상자로 특수학교 또는 일반학교 특수(일반)학급에 재학 중인 자', '[제한] ※ 기관확인필요']::text[]),
  ('KOSAF-26M-008', '보훈장학금(대학장학)', '국가보훈부', ARRAY['6·25 전몰군경자녀의 자녀로써 대학에 재학중인 자※ 신청대상은 1953년 7월 27일 이전 및 ''참전유공자 예우 및 단체설립에 관한 법률'' 별표에 따른 전투기간 중에 전사하거나 순직한 국가유공자의 손자녀', '[제한] 국가유공자의 전공사상 시기가 6·25전쟁이 아닌 경우', '재학 중인 학교의 학칙상 수업연한 초과자', '당해 학기에 본인이 납부한 수업료가 없는 경우(타 장학금 수령 포함)']::text[]),
  ('KOSAF-26M-011', '학업장려대학생', '재단법인논산시장학회', ARRAY['정규대학교(2년제포함) 신입생', '2003년 1월 1일 이후 촐생자 중 공고일 기준 고등학교 졸업 학력 취득 후 5년이 경과되지 않은 자', '[제한] 제한없음']::text[]),
  ('KOSAF-26M-020', 'ADF최재형장학생', '아시아발전재단', NULL::text[]),
  ('KOSAF-REV-012', '장학생', '(재)한국로타리장학문화재단', ARRAY['대학(원)생 : 국내외 학교/내외국인 학생 모두 가능', '[제한] 타 장학금 수혜자가 아닌 학생 (학업지원비로 신청할 경우 중복지원 가능/즉 생활비)']::text[]),
  ('KOSAF-REV-013', '새내기 지원금', '경상남도 창원시청', ARRAY['창원시 관내 고교를 졸업하고 2026년도에 관내 대학에 1학년으로 재학 중인 자자', '[제한] 1990.12.31 이전 출생자', '재학생이 아닌 경우', '학사과정이 아닌 경우', '대학(원)생 생활안정지원사업 등 유사사업 수혜자']::text[]),
  ('KOSAF-REV-014', '학자금대출이자지원', '제주특별자치도청', ARRAY['공고일 기준 국내 대학(원) 재학생/휴학생/졸업(중·자퇴 포함) 후 10년 이내의 미취업자', '[제한] ※ 기관확인필요']::text[]),
  ('KOSAF-REV-015', '보훈장학금(대학원장학)', '국가보훈부', ARRAY['국가보훈법령에 따라 교육지원을 받는 본인·배우자·자녀', '국가유공자 본인', '전몰/순직군경/순직공무원/4·19혁명사망자/국가사회발전특별공조순직자의 배우자', '고엽제후유의증환자(수당대상자) 본인', '5.18민주운동부상자 본인/사망·행방불명자의 배우자 등', '[제한] 대학원 정규 첫 학기 신입생', '대학원 해당과정 수업연한 초과자 (수업연한에 포함되어 있는 논문학기 경우는 지원)', '연구과정 및 해외유학 과정']::text[]),
  ('KOSAF-REV-016', '보훈장학금(특수교육장학)', '국가보훈부', ARRAY['보훈법령에 의한 교육지원대상자 중「장애인 등에 대한 특수교육법」의 특수교육대상자로 특수학교 또는 일반학교 특수(일반)학급에 재학 중인 자', '[제한] ※ 기관확인필요']::text[]),
  ('KOSAF-REV-017', '보훈장학금(대학장학)', '국가보훈부', ARRAY['6·25 전몰군경자녀의 자녀로써 대학에 재학중인 자※ 신청대상은 1953년 7월 27일 이전 및 ''참전유공자 예우 및 단체설립에 관한 법률'' 별표에 따른 전투기간 중에 전사하거나 순직한 국가유공자의 손자녀', '[제한] 국가유공자의 전공사상 시기가 6·25전쟁이 아닌 경우', '재학 중인 학교의 학칙상 수업연한 초과자', '당해 학기에 본인이 납부한 수업료가 없는 경우(타 장학금 수령 포함)']::text[]),
  ('KOSAF-REV-018', '학업장려대학생', '재단법인논산시장학회', ARRAY['정규대학교(2년제포함) 신입생', '2003년 1월 1일 이후 촐생자 중 공고일 기준 고등학교 졸업 학력 취득 후 5년이 경과되지 않은 자']::text[]),
  ('KOSAF-REV-019', 'ADF최재형장학생', '아시아발전재단', ARRAY['[제한] 기관별 최대 추천 장학생 수 6인부터는 지원서 무표처리']::text[]),
  ('KU-043', '2026학년도 1학기 노어노문학과 정경택 교우 장학금', '고려대학교 노어노문학과', NULL::text[]),
  ('KU-024', '2026학년도 영어영문학과 교우장학금', '고려대학교 영어영문학과', NULL::text[]),
  ('KU-026', '2026학년도 통계학과 진리장학 빅데이터 페스티벌', '고려대학교 통계학과', NULL::text[]),
  ('CC-001', '2026 국회기후변화포럼 기후변화 장학생', '국회기후변화포럼 / (재)문숙과학지원재단 / 한국남동발전', ARRAY['기초생활수급자 또는 법정 차상위계층 증빙서류 발급 가능한 자. 국회기후변화포럼 제16기 대학생 기후변화 아카데미 참여 의무 (2026년 7월 초중순). COP31 참관단 활동(2026.11.9~20, 튀르키예 안탈리아) - 우수학생 선발 시 해당']::text[]),
  ('YS-005', '블루버터플라이 Discovery Track 6기', '(재)연경장학회', ARRAY['여름방학 중 2주 이내 국내·외 탐방 (팀 단위 지원)']::text[]),
  ('IC-003', '2026년도 재능인 장학생', '(재)인천인재평생교육진흥원', NULL::text[]),
  ('SM-001', '2026년 서울독립유공자후손장학금 (서울 소재 대학 재학)', '(재)서울미래인재재단', ARRAY['독립유공자(순국선열,애국지사)의 4~6대 후손', '[제한] 참전유공자 등 기타 보훈대상자 제외, 정규 마지막 학기 재학생 제외']::text[]),
  ('CN-001', '2026년 재능키움 장학사업', '(재)충남평생교육진흥원', ARRAY['신청자 또는 부모 충남 1년 이상 거주, 직전학기 최소 8학점 이상 이수', '[제한] 전년도(2025) 당해 장학금 수혜자 및 당해연도 진흥원 내 타 장학 중복 불가']::text[]),
  ('GM-001', '2026년도 구미시장학재단 장학생', '구미시장학재단', ARRAY['관내 고교 졸업생(대학생) 또는 재학생(고교생)']::text[]),
  ('KOSAF-26M-019', '대하장학생', '재단법인 대하장학회', ARRAY['본인 또는 부모가 명씨 성을 가진 대학생 및 대학원 석·박사과정 재학생', '[제한] 장학금 수혜는 총 2회를 초과할 수 없음']::text[]),
  ('KOSAF-REV-011', '대하장학생', '재단법인 대하장학회', ARRAY['본인 또는 부모가 명씨 성을 가진 대학생 및 대학원 석·박사과정 재학생', '[제한] 장학금 수혜는 총 2회를 초과할 수 없음']::text[]),
  ('KFAS-001', '2026년 인재림 제6기 장학생', '한국고등교육재단 (KFAS)', ARRAY['1년간 커리큘럼 풀참여 가능자 (어학연수, 교환학생, 취업, 군복무 등 예정자 지원 불가)']::text[]),
  ('KICS-001', '2026 KICS 한국통신학회 장학금', '한국통신학회 (KICS)', ARRAY['KICS 학생회원/정회원/온라인 회원 필수, 통신/전자/컴퓨터/소프트웨어 등 ICT 관련 학과']::text[]),
  ('FB-001', '2027 풀브라이트 대학원 장학 프로그램 (인문·사회과학·예체능)', '한미교육위원단 (Fulbright Korea)', ARRAY['TOEFL iBT 4.5점(구버전 88점) 또는 IELTS Academic 6.5점 이상 필수 (영문학·언어학 전공 예정자는 TOEFL 5점/IELTS 7점)', 'GRE General 또는 GMAT 필수 (법학·일부예술·북한이탈청년은 면제)', '장학금 수혜 시작일 3개월 전부터 국내 거주 가능한 자', '최근 6년간 미국 5년 이상 연속 체류자 지원 불가', '과거 5년 내 미국 정부 장학금 수혜자 불가(WEST·UGRAD 제외)', 'J-1 비자 2년 본국거주 요건 충족 가능한 자']::text[]),
  ('FB-002', '2027 풀브라이트 이공계 첨단분야 대학원 장학 프로그램 (STEM)', '한미교육위원단 (Fulbright Korea)', ARRAY['TOEFL iBT 4.5점(구버전 88점) 또는 IELTS Academic 6.5점 이상 필수', 'GRE General 또는 GMAT 필수', '장학금 수혜 시작일 3개월 전부터 국내 거주 가능한 자', '최근 6년간 미국 5년 이상 연속 체류자 불가', '과거 5년 내 미국 정부 장학금 수혜자 불가(WEST·UGRAD 제외)']::text[]),
  ('KF-005', '2026년도 국비유학생 선발시험 - 일반전형', '교육부 국립국제교육원', ARRAY['외국어시험 성적 필수(영어 TOEFL iBT 93점·IELTS 6.5·TOEIC 820 등 기준 이상)', '한국사능력검정 3급 이상', '학교장 추천 필수']::text[]),
  ('KF-006', '2026년도 국비유학생 선발시험 - 꿈나래전형', '교육부 국립국제교육원', ARRAY['외국어시험 성적 필수(일반전형과 동일 기준)', '한국사능력검정 3급 이상', '기준중위소득 100% 이하 증빙 필수']::text[]),
  ('KF-007', '2026년도 국비유학생 선발시험 - 기술·기능인전형', '교육부 국립국제교육원', ARRAY['외국어시험 기준: 영어 TOEFL iBT 48점 이상·TOEIC 396점 이상 등 (일반전형보다 낮은 기준)', '한국사능력검정 4급 이상', '중소기업 장기재직자·기능장 이상 자격 소지자 우대']::text[]),
  ('DK-001', '2026년 DUO-Korea Fellowship', '아셈듀오장학재단 (대한민국 교육부)', ARRAY['유럽 ASEM 교환학생 확정자, 대학 대리접수']::text[]),
  ('GT-001', '2026년 국토교통부 청년월세 지원사업', '국토교통부', ARRAY['부모님과 별도 거주하는 무주택자 (전입신고 필수). 재산: 청년독립가구 1억2,200만원 이하 및 원가구 4억7,000만원 이하']::text[]),
  ('HK-001', '2026 Hackers Bridge Scholarship (Alumni 장학생)', 'Hackers (해커스)', ARRAY['해커스어학원·해커스인강 수강한 동문으로 2026년 해외대학(원) 어드미션 받은 자']::text[]),
  ('HK-002', '2026 Hackers Bridge Scholarship (Family 장학생)', 'Hackers (해커스)', ARRAY['해커스 홈페이지(고우해커스, 해커스영어 등)에서 정보를 함께 나누는 모든 이들 중 2026년 해외 대학(원) 어드미션 받은 자']::text[]),
  ('AR-REV-002', '2026년 엔젤루트 일본 어학연수 장학금', '엔젤루트국제교류장학회', ARRAY['2026년 10월 학기 일본 어학연수 희망자', '[제한] 해외여행 및 일본 비자 발급 결격 사유자']::text[]),
  ('EB-001', '2026학년도 EBS 꿈장학생 수기 공모', 'EBS (한국교육방송공사)', ARRAY['EBS 활용 학습 수기 제출자']::text[]),
  ('KOSAF-26M-014', '국고학자금', '사립학교직원연금공단', ARRAY['사립학교직원연금법 적용대상 재직 교직원 본인 및 그 자녀 (교직원과 재혼한 배우자의 자녀 포함)', '고등교육법 제2조 각호의 학교 또는 해외 정규대학 학사 및 전문학사 과정', '[제한] 등록금 면제 또는 장학금 수령자', '이중수혜 또는 이중대여', '대여횟수 초과', '비 대상 교육기관(대학원/직업훈련학교/전문학교/각종 비인가 학교/국비 유학생/정규 대학이 아닌 경우/해외어학연수과정/비학위과정 등)']::text[]),
  ('KOSAF-REV-010', '국고학자금', '사립학교직원연금공단', ARRAY['사립학교직원연금법 적용대상 재직 교직원 본인 및 그 자녀 (교직원과 재혼한 배우자의 자녀 포함)', '고등교육법 제2조 각호의 학교 또는 해외 정규대학 학사 및 전문학사 과정', '[제한] 등록금 면제 또는 장학금 수령자', '이중수혜 또는 이중대여', '대여횟수 초과', '비 대상 교육기관(대학원/직업훈련학교/전문학교/각종 비인가 학교/국비 유학생/정규 대학이 아닌 경우/해외어학연수과정/비학위과정 등)']::text[]),
  ('KOSAF-26M-015', '배려대상자', '(재)호국장학재단', ARRAY['현역군인 및 군무원의 대학 재학중인 자녀', '(국외대학) ''26년 3월 재학중인 재학생/4월 졸업생 제외/전년도 가을학기 신입생 포함', '[제한] 국고지원 대학 또는 등록금 실 납부액이 100만원 미만자는 중복지원 금지', '정규학기 초과등록자/동일한 년도(학기) 성적으로 기 장학금 수혜자/''26년 9월 이전 졸업자는 대상에서 제외', '방송통신대학/사내대학/국비대학/2년 미만 교육과정 등 지급제외']::text[]),
  ('KOSAF-26M-016', '성적우수자', '(재)호국장학재단', ARRAY['현역군인 및 군무원의 대학 재학중인 자녀', '[제한] 정규학기 초과등록자/동일한 년도(학기) 성적으로 기 장학금 수혜자/''26 9월 이전 졸업자는 대상에서 제외', '방송통신대학/사내대학/국비대학/2년 미만 교육과정의 학교 등은 선발 제외']::text[]),
  ('KOSAF-REV-008', '배려대상자', '(재)호국장학재단', ARRAY['현역군인 및 군무원의 대학 재학중인 자녀', '(국외대학) ''26년 3월 재학중인 재학생/4월 졸업생 제외/전년도 가을학기 신입생 포함', '[제한] 국고지원 대학 또는 등록금 실 납부액이 100만원 미만자는 중복지원 금지', '정규학기 초과등록자/동일한 년도(학기) 성적으로 기 장학금 수혜자/''26년 9월 이전 졸업자는 대상에서 제외', '방송통신대학/사내대학/국비대학/2년 미만 교육과정 등 지급제외']::text[]),
  ('KOSAF-REV-009', '성적우수자', '(재)호국장학재단', ARRAY['현역군인 및 군무원의 대학 재학중인 자녀', '[제한] 정규학기 초과등록자/동일한 년도(학기) 성적으로 기 장학금 수혜자/''26 9월 이전 졸업자는 대상에서 제외', '방송통신대학/사내대학/국비대학/2년 미만 교육과정의 학교 등은 선발 제외']::text[]),
  ('KOSAF-26M-003', '대학재학장학금', '경상남도청', ARRAY['도내 대학 2~4학년 학부 재학생', '[제한] 경상남도장학회 2025년 도내 대학 재학생 장학금 수해자 및 2026년 장학사업 중복 수혜자', '타 기관 생활비성 장학금 수혜자', '한 세대 1명만 선발']::text[]),
  ('KOSAF-REV-007', '대학재학장학금', '경상남도청', ARRAY['도내 대학 2~4학년 학부 재학생', '[제한] 경상남도장학회 2025년 도내 대학 재학생 장학금 수해자 및 2026년 장학사업 중복 수혜자', '타 기관 생활비성 장학금 수혜자', '한 세대 1명만 선발']::text[]),
  ('KOSAF-26M-017', '석성장학생', '재단법인 석성장학회', ARRAY['모범적인 선행공적이 있는 학생', '[제한] 학자금대출과 타 장학금이 해당 학기 등록금을 초과시 제외']::text[]),
  ('KOSAF-26M-018', '특별장학생', '재단법인 석성장학회', ARRAY['국가와 국민을 위해 헌신하다가 순직한 자의 유자녀학생·탈북자 및 다문화 가정학생 및 특별한 선행으로 언론 등에 공개되어 주위로부터 추천을 받은 학생', '[제한] 한국장학재단 중복심사 결과 결격 사유가 없어야 함']::text[]),
  ('KOSAF-REV-005', '석성장학생', '재단법인 석성장학회', ARRAY['모범적인 선행공적이 있는 학생', '[제한] 학자금대출과 타 장학금이 해당 학기 등록금을 초과시 제외']::text[]),
  ('KOSAF-REV-006', '특별장학생', '재단법인 석성장학회', ARRAY['국가와 국민을 위해 헌신하다가 순직한 자의 유자녀학생·탈북자 및 다문화 가정학생 및 특별한 선행으로 언론 등에 공개되어 주위로부터 추천을 받은 학생', '[제한] 한국장학재단 중복심사 결과 결격 사유가 없어야 함']::text[]),
  ('KOSAF-26M-009', '대학생장학금', '(재)인제군장학회', ARRAY['저소득층·장애인의 자녀 및 예체능 특기자 우선 선발 후 일반 대학생 성적순 선발', '[제한] (재)인제군장학회 장학금과의 중복지원 불가', '대학원생·원격대학·야간대학·외국대학·직장인 제외', '평생교육법에 의한 학점은행제 교육원 및 전문학교', '생활비를 지원받는 특수대학', '대학졸업예정자·휴학예정자·신청학기 성적으로 기 장학금을 지급받은 이력이 있는 자']::text[]),
  ('KOSAF-26M-010', '예/체능특기자장학금', '(재)인제군장학회', ARRAY['직전 학년도에 도 공인대회 2위 이내 입상경력이 있거나 전국단위 공인대회 3위 이내 입상경력이 있는 사람으로 단체전 입상자를 포함. 복학생의 경우 휴학 기간 중에 입상한 경력까지 포함', '[제한] (재)인제군장학회 장학금과의 중복지원 불가능', '대학원생·원격대학·야간대학·외국대학·직장인', '평생교육법에 의한 학점은행제 교육원 및 전문학교', '생활비를 지원받는 특수대학', '대학졸업예정자·휴학예정자·신청학기 성적으로 기 장학금을 지급받은 이력이 있는 자']::text[]),
  ('KOSAF-REV-003', '대학생장학금', '(재)인제군장학회', ARRAY['저소득층·장애인의 자녀 및 예체능 특기자 우선 선발 후 일반 대학생 성적순 선발', '[제한] (재)인제군장학회 장학금과의 중복지원 불가', '대학원생·원격대학·야간대학·외국대학·직장인 제외', '평생교육법에 의한 학점은행제 교육원 및 전문학교', '생활비를 지원받는 특수대학', '대학졸업예정자·휴학예정자·신청학기 성적으로 기 장학금을 지급받은 이력이 있는 자']::text[]),
  ('KOSAF-REV-004', '예/체능특기자장학금', '(재)인제군장학회', ARRAY['직전 학년도에 도 공인대회 2위 이내 입상경력이 있거나 전국단위 공인대회 3위 이내 입상경력이 있는 사람으로 단체전 입상자를 포함. 복학생의 경우 휴학 기간 중에 입상한 경력까지 포함', '[제한] (재)인제군장학회 장학금과의 중복지원 불가능', '대학원생·원격대학·야간대학·외국대학·직장인', '평생교육법에 의한 학점은행제 교육원 및 전문학교', '생활비를 지원받는 특수대학', '대학졸업예정자·휴학예정자·신청학기 성적으로 기 장학금을 지급받은 이력이 있는 자']::text[]),
  ('MA-001', '2026년 영케어러(가족돌봄청년) 위기극복지원사업', '사회복지법인 밀알복지재단', ARRAY['질병 또는 장애가 있는 가족 구성원을 돌보는 청년. 장애·한부모·다문화가정 등 사회취약계층 우대']::text[]),
  ('KOSAF-26M-005', '제대군인대부지원(나라사랑대출)', '국가보훈부', ARRAY['국가보훈부에 등록된 10년이상 장기복무 제대군인', '[제한] 학자금 대출제도를 운용하는 타기관으로부터 동일 학기 학자금 지원을 받았거나 받을 분']::text[]),
  ('KOSAF-26M-012', '남원의 별 특별장학생', '춘향장학재단', ARRAY['대회수상 (체육/예술 분야)', '국가대표선발', '[제한] 동일종목 및 동일수상실적으로 춘향인재장학금과 중복 지급 불가']::text[]),
  ('KOSAF-26M-013', 'SOS 장학금', '영천시장학회', ARRAY['당해에 발생한 재난·재해(화재 등)로 인한 피해발생 또는 주 양육자의 사망 등으로 학업을 지속하기 어려워 긴급히 지원이 필요한·대학생', '[제한] 당해연도 내 동일인 중복 지급 불가']::text[]),
  ('KOSAF-REV+L7+A2+A2:Y15', '제대군인대부지원(나라사랑대출)', '국가보훈부', ARRAY['국가보훈부에 등록된 10년이상 장기복무 제대군인', '[제한] 학자금 대출제도를 운용하는 타기관으로부터 동일 학기 학자금 지원을 받았거나 받을 분']::text[]),
  ('KOSAF-REV-001', '남원의 별 특별장학생', '춘향장학재단', ARRAY['대회수상 (체육/예술 분야)', '국가대표선발', '[제한] 동일종목 및 동일수상실적으로 춘향인재장학금과 중복 지급 불가']::text[]),
  ('KOSAF-REV-002', 'SOS 장학금', '영천시장학회', ARRAY['당해에 발생한 재난·재해(화재 등)로 인한 피해발생 또는 주 양육자의 사망 등으로 학업을 지속하기 어려워 긴급히 지원이 필요한·대학생', '[제한] 당해연도 내 동일인 중복 지급 불가']::text[]),
  ('KF-004', '2026년 다문화·탈북(이주·북한배경)학생 멘토링장학금 멘토 모집', '한국장학재단 / 교육부', ARRAY['국가근로장학금·대학생 청소년교육지원장학금·사업 중복참여 불가']::text[]),
  ('OJ-003', '2026년 옹진장학관 입주생 추가선발 (대학생·대학원생·취준생 - 옹진장학관/제2옹진장학관)', '(재)옹진군인재육성재단', ARRAY['기초생활수급자·차상위·한부모·국가유공자·장애인 가정 가산점. 예체능 특기자(최근 1년 내 전국규모대회 수상) 가산점. 2026학년도 신입생 추가 가산점']::text[]),
  ('KU-014', '2026학년도 경영대학 성적우수장학금', '고려대학교 경영대학', NULL::text[]),
  ('KU-015', '2026학년도 문과대학 성적우수장학금', '고려대학교 문과대학', NULL::text[]),
  ('KU-043', '2026학년도 1학기 노어노문학과 정경택 교우 장학금', '고려대학교 노어노문학과', NULL::text[]),
  ('KU-044', '2026학년도 1학기 글로벌한국융합학부 성재(誠齋)장학금', '고려대학교 글로벌한국융합학부', NULL::text[]),
  ('KU-045', '2026학년도 1학기 보건과학대학 외국인 재학생 멘토링 프로그램 멘토 근로장학금', '고려대학교 보건과학대학', NULL::text[])
), matched AS (
  SELECT DISTINCT ON (s.id) s.id, c.csv_id, c.special
  FROM public.scholarships s
  JOIN csv_special c
    ON s.organization = c.organization
   AND (s.name = c.name OR s.name ILIKE '%' || c.name || '%' OR c.name ILIKE '%' || s.name || '%')
  WHERE s.apply_end_date >= DATE '2026-04-29'
     OR s.apply_end_date = DATE '9999-12-31'
  ORDER BY s.id, length(c.name) DESC
), updated AS (
  UPDATE public.scholarships s
  SET qual_special_info = m.special,
      updated_at = now()
  FROM matched m
  WHERE s.id = m.id
  RETURNING s.id, s.name, m.csv_id, s.qual_special_info
)
SELECT
  count(*) AS updated_count,
  count(*) FILTER (WHERE qual_special_info IS NOT NULL AND cardinality(qual_special_info) > 0) AS updated_with_special_info
FROM updated;
