-- SKKU policy alignment (crawler-first)
-- 목적:
-- 1) 성균관대 문과대학 '독어독문'을 '독어독문학과'로 정규화
-- 2) 크롤러 기준 누락 학과 '바이오신약·규제과학과'를 약학대학에 보완
-- 3) 기존 유저 문자열 필드(department, double_major_department)를 department_id 기준으로 동기화
--
-- 주의:
-- - 학부대학의 '공학계열/사회과학계열/인문과학계열/자연과학계열/자유전공계열'은
--   전공(학과) 자체가 아닌 진입 계열 성격이므로 비교 리포트에서는 제외 정책을 사용한다.
-- - 무역학과, 퀀트응용경제학과는 크롤러에서 비활성화(대학원/운영중단 정책)로 처리한다.

begin;

with skku as (
  select id
  from public.universities
  where name ilike '%성균관%'
  limit 1
),
liberal_college as (
  select c.id
  from public.university_colleges c
  join skku u on u.id = c.university_id
  where c.name = '문과대학'
  limit 1
)
update public.university_departments d
set name = '독어독문학과'
where d.college_id in (select id from liberal_college)
  and d.name = '독어독문'
  and not exists (
    select 1
    from public.university_departments d2
    where d2.college_id = d.college_id
      and d2.name = '독어독문학과'
  );

with skku as (
  select id
  from public.universities
  where name ilike '%성균관%'
  limit 1
),
pharmacy_college as (
  select c.id
  from public.university_colleges c
  join skku u on u.id = c.university_id
  where c.name = '약학대학'
  limit 1
)
insert into public.university_departments (college_id, name)
select pc.id, '바이오신약·규제과학과'
from pharmacy_college pc
where not exists (
  select 1
  from public.university_departments d
  where d.college_id = pc.id
    and d.name = '바이오신약·규제과학과'
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
