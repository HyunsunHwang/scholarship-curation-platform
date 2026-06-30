-- Ewha policy alignment:
-- 1) 융합전자반도체는 학부 레벨(융합전자반도체공학부)로 운영
-- 2) 인공지능 계열은 전공 레벨(인공지능전공, 데이터사이언스전공)로 운영

begin;

with ewha_university as (
  select id
  from public.universities
  where name ilike '%이화%'
  limit 1
),
ai_college as (
  select c.id
  from public.university_colleges c
  join ewha_university u on u.id = c.university_id
  where c.name = '인공지능대학'
  limit 1
)
update public.university_departments d
set name = '인공지능전공'
where d.college_id in (select id from ai_college)
  and d.name = '인공지능데이터사이언스학부'
  and not exists (
    select 1
    from public.university_departments d2
    where d2.college_id = d.college_id
      and d2.name = '인공지능전공'
  );

with ewha_university as (
  select id
  from public.universities
  where name ilike '%이화%'
  limit 1
),
ai_college as (
  select c.id
  from public.university_colleges c
  join ewha_university u on u.id = c.university_id
  where c.name = '인공지능대학'
  limit 1
)
insert into public.university_departments (college_id, name)
select id, '데이터사이언스전공'
from ai_college
where not exists (
  select 1
  from public.university_departments d
  where d.college_id in (select id from ai_college)
    and d.name = '데이터사이언스전공'
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
