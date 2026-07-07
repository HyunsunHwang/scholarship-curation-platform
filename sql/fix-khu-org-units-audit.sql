-- 경희대학교 org_units 전수 감사 중 발견: 4건 수정
-- (검색 근거는 각 섹션에 명시)
--
-- 1) 학과명 오류: "AI로봇공학전공" -> "지능로봇공학전공"
--    공과대학 기계공학과가 2025년 기계공학부로 개편되며 신설된 3개 세부전공
--    (기계공학전공/지능로봇공학전공/항공우주모빌리티전공) 중 하나. 학과 홈페이지
--    (me.khu.ac.kr), 2026 모집요강, 대학주보 기사, 일반대학원 시행세칙 모두
--    "지능로봇공학전공"으로 표기하며 "AI로봇공학전공"이라는 명칭은 쓰이지 않음.
--
-- 2) 2025년 학과 통합 미반영: 한방생명공학과 + 식물·환경신소재공학과 -> 융합바이오·신소재공학과
--    https://cbam.khu.ac.kr (융합바이오·신소재공학과 홈페이지 연혁: "2025 ... 신설
--    (식물·환경신소재공학과, 한방생명공학과 학과 통합)")
--    통합 후 학과(id=849, 융합바이오·신소재공학과)는 이미 org_units에 정상 존재하므로,
--    더 이상 신입생을 모집하지 않는 구학과 2건(1120, 1122)을 제거한다.
--    사전 확인: org_unit_aliases/scholarship_target_units/profiles 참조 0건, legacy_table도
--    null이라 legacy 테이블 정리 불필요.
--
-- 3) field_code 누락 8건: 형제 학과는 값이 있는데 이 8개만 null로 비어 있었음
--    817 의상학과            -> 자연   (생활과학대학 형제: 아동가족학과/주거환경학과/식품영양학과=자연)
--    856 약과학과            -> 의약   (약학대학 형제: 약학과/한약학과=의약)
--    860 관현전공, 863 피아노전공 -> 예체능 (음악대학 형제: 성악과/작곡과=예체능)
--    865 한국화전공          -> 예체능 (미술대학 형제: 조소전공/회화전공=예체능)
--    867 발레                -> 예체능 (무용학부 형제: 한국무용/현대무용=예체능)
--    878 골프산업학과, 882 태권도학과 -> 예체능 (체육대학 형제: 체육학과/스포츠지도학과=예체능)
--
-- 4) 결측 학과: 자율전공학부(서울캠퍼스)는 글로벌리더전공(이미 존재, id=781)과
--    글로벌비즈니스전공 2개를 운영하는데 후자가 누락되어 있었음.
--    https://globaleminence.khu.ac.kr ("외국인 특화 전공인 '글로벌 비즈니스' 전공은
--    일반경영 전공의 토대 위에 호텔 관광을 결합한 융합형 인재를 양성")
--    형제(781)와 동일한 college(141)/field_code('공학') 패턴을 그대로 따름.

begin;

-- 1) 학과명 오류 수정
update public.org_units
set name = '지능로봇공학전공'
where id = 825 and name = 'AI로봇공학전공';

-- 2) 2025년 통합으로 폐지된 구학과 제거 (참조 0건 확인됨)
delete from public.org_units
where id in (1120, 1122)
  and legacy_table is null
  and legacy_id is null;

-- 3) field_code 누락 보완
update public.org_units
set field_code = '자연'
where id = 817 and field_code is null;

update public.org_units
set field_code = '의약'
where id = 856 and field_code is null;

update public.org_units
set field_code = '예체능'
where id in (860, 863, 865, 867, 878, 882) and field_code is null;

-- 4) 자율전공학부(글로벌비즈니스전공) 추가
with target_college as (
  select legacy_id as college_id
  from public.org_units
  where id = 141 and legacy_table = 'university_colleges'
)
insert into public.university_departments (college_id, name)
select college_id, '자율전공학부(글로벌비즈니스전공)'
from target_college
where not exists (
  select 1 from public.university_departments d
  where d.college_id = (select college_id from target_college)
    and d.name = '자율전공학부(글로벌비즈니스전공)'
);

insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select pc.id, 'department', d.name, pc.field_code, 'university_departments', d.id
from public.university_departments d
join public.org_units pc on pc.id = 141
where d.college_id = pc.legacy_id
  and d.name = '자율전공학부(글로벌비즈니스전공)'
  and not exists (
    select 1 from public.org_units ou
    where ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
  );

commit;

-- 검증
select id, parent_id, unit_type, name, field_code, path_ids
from public.org_units
where id in (825, 1120, 1122, 817, 856, 860, 863, 865, 867, 878, 882)
   or (parent_id = 141)
order by id;
