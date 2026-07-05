-- 이화여대 의과대학은 의예과(2년) + 의학과(4년) 2개 학과로 구성되나,
-- university_departments / org_units 모두 의예과만 존재하고 의학과가 누락되어 있었음.
-- 참고: https://www.ewha.ac.kr/ewha/academics/medicine.do
--   "2015년 의과대학으로 전환 후, 의예과, 의학과 2개 학과로 구성되어 있으며..."

begin;

-- 1) legacy 테이블에 의학과 추가
with ewha_university as (
  select id
  from public.universities
  where name ilike '%이화%'
  limit 1
),
medicine_college as (
  select c.id
  from public.university_colleges c
  join ewha_university u on u.id = c.university_id
  where c.name = '의과대학'
  limit 1
)
insert into public.university_departments (college_id, name)
select id, '의학과'
from medicine_college
where not exists (
  select 1
  from public.university_departments d
  where d.college_id in (select id from medicine_college)
    and d.name = '의학과'
);

-- 2) org_units 백필 (phase1 백필과 동일 패턴, legacy_table/legacy_id 멱등 가드)
insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select pc.id, 'department', d.name, '의약', 'university_departments', d.id
from public.university_departments d
join public.org_units pc
  on pc.legacy_table = 'university_colleges' and pc.legacy_id = d.college_id
where d.name = '의학과'
  and pc.name = '의과대학'
  and not exists (
    select 1 from public.org_units ou
    where ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
  );

commit;

-- 검증
select
  d.id as department_id,
  d.name as department_name,
  ou.id as org_unit_id,
  ou.parent_id,
  ou.path_ids,
  ou.field_code
from public.university_departments d
join public.org_units ou
  on ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
where d.name in ('의예과', '의학과')
order by d.name;
