-- 서울시립대학교 org_units 전수 감사 중 발견: field_code 오류 3건 + 결측 1건 + 구조 오류 1건 수정
-- (검색 근거는 각 섹션에 명시)
--
-- 1) 중국어문화학과(899) field_code 오분류: '자연' -> '인문'
--    인문대학 소속 어문학과이며 형제 학과(국사학과/국어국문학과/영어영문학과/철학과)는
--    모두 '인문'으로 분류되어 있음. 학과 홈페이지(uos.ac.kr/liberalarts/depart/chinese)와
--    인문대학 페이지(uos.ac.kr .../academic/college/liberalarts.do) 모두 인문대학 소속임을
--    명시하며 자연계열 요소는 없음(언어·문화 교육과정).
--
-- 2) 자유전공학부(인문)(921), 자유전공학부(자연)(922) field_code 오분류: 둘 다 '공학' -> 각각 '인문'/'자연'
--    '(인문)'/'(자연)' 접미사가 붙은 학과는 접미사대로 계열을 분리하는 것이 DB의 기존 관례
--    (한양대 한양인터칼리지학부(인문)=인문/(자연)=자연). 서울시립대 자유전공학부도
--    2026학년도 정시에서 인문계열 45명·자연계열 45명을 별도 모집단위로 선발
--    (한국일보 2025-12-22, 서울파이낸스 2026 정시모집 보도).
--    college(173, 자유전공학부) 자체의 field_code='공학'은 경희대/고려대/동국대 등
--    동일 성격의 college 다수가 따르는 관례(자유전공학부류 college는 공학으로 표기)이므로 유지.
--
-- 3) 조각학과(920) field_code 결측: null -> '예체능'
--    예술체육대학 형제 학과(스포츠과학과/음악학과/디자인학과) 전부 '예체능'으로 분류되어
--    있으나 조각학과만 누락됨.
--
-- 4) 융합전공학부(924) 소속 오류: 첨단융합학부(174) 하위 학과처럼 등재되어 있으나
--    실제로는 자유융합대학 산하에서 첨단융합학부와 병렬인 독립 학부.
--    대학요람 교과과정 목차("자유융합대학: 첨단융합학부/융합전공학부/자유전공학부")와
--    입학처 전공안내(gsuph.uos.ac.kr) 모두 세 학부를 형제 관계로 나열하며, 융합전공학부는
--    별도 학부소개 페이지(uos.ac.kr/clacds/cds)를 가진 독자 조직(16개 통섭전공 운영).
--    첨단융합학부의 실제 하위 세부전공은 융합바이오헬스전공/지능형반도체전공/
--    첨단인공지능전공 3개뿐임. 사전 확인: org_unit_aliases/scholarship_target_units/profiles
--    참조 0건. notice-sources.csv(uos_042)는 org_unit_id=924를 그대로 참조하므로 크롤링에는
--    영향 없음. path_ids는 트리거(org_units_set_path)가 parent_id 변경 시 자동 재계산함.
--    -> parent_id를 174에서 university(10)으로 변경해 173/174와 동일 레벨의 최상위 학부로 이동.

begin;

-- 1) 중국어문화학과 field_code 수정
update public.org_units
set field_code = '인문'
where id = 899 and field_code = '자연';

-- 2) 자유전공학부(인문)/(자연) field_code 수정
update public.org_units
set field_code = '인문'
where id = 921 and field_code = '공학';

update public.org_units
set field_code = '자연'
where id = 922 and field_code = '공학';

-- 3) 조각학과 field_code 결측 보완
update public.org_units
set field_code = '예체능'
where id = 920 and field_code is null;

-- 4) 융합전공학부를 첨단융합학부 하위에서 대학 직속 최상위 학부로 이동
update public.org_units
set parent_id = 10
where id = 924
  and parent_id = 174
  and not exists (
    select 1 from public.org_unit_aliases where org_unit_id = 924
    union all
    select 1 from public.scholarship_target_units where org_unit_id = 924
    union all
    select 1 from public.profiles where org_unit_id = 924
  );

commit;

-- 검증
select id, parent_id, unit_type, name, field_code, path_ids
from public.org_units
where id in (899, 921, 922, 920, 924, 173, 174)
order by id;
