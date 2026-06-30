-- Hanyang policy alignment (crawler-first)
-- 목적:
-- 1) 데이터사이언스 표기를 학부 단위('데이터사이언스학부')로 통일
-- 2) 크롤러 기준 누락 학과('기능성식품학과')를 생활과학대학에 보강
-- 3) 기존 유저 문자열 필드(department, double_major_department)를 department_id 기준으로 동기화
--
-- 참고:
-- - 기능성식품학과는 공식 페이지에서 '(계약학과)' 병기 사례가 있으나,
--   서비스 canonical 명칭은 '기능성식품학과'로 유지한다.

begin;

with hanyang as (
  select id
  from public.universities
  where name ilike '%한양%'
  limit 1
),
engineering_college as (
  select c.id
  from public.university_colleges c
  join hanyang u on u.id = c.university_id
  where c.name = '공과대학'
  limit 1
)
update public.university_departments d
set name = '데이터사이언스학부'
where d.college_id in (select id from engineering_college)
  and d.name = '데이터사이언스학과'
  and not exists (
    select 1
    from public.university_departments d2
    where d2.college_id = d.college_id
      and d2.name = '데이터사이언스학부'
  );

with hanyang as (
  select id
  from public.universities
  where name ilike '%한양%'
  limit 1
),
living_science_college as (
  select c.id
  from public.university_colleges c
  join hanyang u on u.id = c.university_id
  where c.name = '생활과학대학'
  limit 1
)
insert into public.university_departments (college_id, name)
select c.id, '기능성식품학과'
from living_science_college c
where not exists (
  select 1
  from public.university_departments d
  where d.college_id = c.id
    and d.name = '기능성식품학과'
);

update public.profiles p
set department = d.name
from public.university_departments d
where p.department_id = d.id
  and p.department is distinct from d.name;

update public.profiles p
set double_major_department = d.name
from public.university_departments d
where p.double_major_department_id = d.id
  and p.double_major_department is distinct from d.name;

commit;
