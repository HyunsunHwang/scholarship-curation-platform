-- 한양대학교 org_units 전수 감사 중 발견: 2건 누락/구조 오류
--
-- 1) 국제학부 -> 국제대학 승격 누락 (2024년경 승격, 산하 2개 학부 체제)
--    https://cis.hanyang.ac.kr/home
--    국제대학 = 국제학부(기존) + 글로벌콘텐츠융합학부(누락)
--    글로벌콘텐츠융합학부 자체 사이트(gcc.hanyang.ac.kr)에도 "국제대학 공지사항 확인 안내"라고
--    안내되어 있어 실제 장학/공지는 국제대학(국제학부) 게시판(sis.hanyang.ac.kr)을 그대로 씀.
--    -> notice-sources.csv는 college-level 소스(hanyang_076)만 college_name/org_unit_id를
--       갱신하면 되고 추가 크롤 소스는 불필요.
--
-- 2) 산업융합학부가 2026학년도부터 '기술혁신대학'으로 승격
--    (재직자 특화 단과대, 국내 최초 모델) https://siis.hanyang.ac.kr/-31
--    기존 DB는 산업융합학부 자체가 최상위 college(org_unit 111, legacy_id=118)였고,
--    그 밑에 실제 department 레코드(org_unit 625, legacy_id=410)가 한 번 더 있었다.
--    college(111)를 삭제하고 department(625)를 새 college(기술혁신대학) 바로 밑으로
--    재배치하는 방식으로 정리한다. (parent_id/name unique 제약 때문에 임시 rename 필요)

begin;

-- 1) 국제학부 -> 국제대학 이름 변경
update public.university_colleges set name = '국제대학' where id = 116;
update public.org_units set name = '국제대학' where id = 109;

-- 2) 글로벌콘텐츠융합학부 추가
insert into public.university_departments (college_id, name)
select 116, '글로벌콘텐츠융합학부'
where not exists (
  select 1 from public.university_departments
  where college_id = 116 and name = '글로벌콘텐츠융합학부'
);

insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select 109, 'department', d.name, '사회', 'university_departments', d.id
from public.university_departments d
where d.college_id = 116 and d.name = '글로벌콘텐츠융합학부'
  and not exists (
    select 1 from public.org_units ou
    where ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
  );

-- 3) 기술혁신대학 신설
insert into public.university_colleges (university_id, name)
select 7, '기술혁신대학'
where not exists (
  select 1 from public.university_colleges where university_id = 7 and name = '기술혁신대학'
);

insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select 6, 'college', c.name, null, 'university_colleges', c.id
from public.university_colleges c
where c.university_id = 7 and c.name = '기술혁신대학'
  and not exists (
    select 1 from public.org_units ou
    where ou.legacy_table = 'university_colleges' and ou.legacy_id = c.id
  );

-- 4) 산업융합학부(department, id=625, legacy_id=410)를 기술혁신대학 하위로 재배치
update public.university_departments
set college_id = (
  select id from public.university_colleges where university_id = 7 and name = '기술혁신대학'
)
where id = 410;

-- 4-1) org_units(111)이 기존에 이름을 그대로 점유하고 있어 unique(parent_id, name) 충돌 방지용 임시 rename
update public.org_units
set name = '__tmp_111__'
where id = 111 and legacy_table = 'university_colleges' and legacy_id = 118;

-- 4-2) 진짜 department 노드(625)를 기술혁신대학 바로 밑으로 재배치
update public.org_units
set parent_id = (
  select id from public.org_units
  where legacy_table = 'university_colleges'
    and legacy_id = (select id from public.university_colleges where university_id = 7 and name = '기술혁신대학')
)
where id = 625 and legacy_table = 'university_departments' and legacy_id = 410;

-- 4-3) 중복이 된 옛 college 래퍼(org_units.id=111) 제거 (참조 없음 확인됨: profiles/scholarship_target_units/org_unit_aliases 0건)
delete from public.org_units where id = 111 and name = '__tmp_111__';

-- 4-4) 참조가 없어진 옛 university_colleges 레거시 행 정리
delete from public.university_colleges where id = 118;

commit;

-- 검증
select id, parent_id, unit_type, name, path_ids, field_code, legacy_table, legacy_id
from public.org_units
where id in (109, 622, 1144)
   or (legacy_table = 'university_departments' and legacy_id = 410)
   or (legacy_table = 'university_colleges' and legacy_id = (
        select id from public.university_colleges where university_id = 7 and name = '기술혁신대학'
      ))
order by parent_id, id;
