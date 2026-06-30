-- Phase 2 (Korea): crawler-based single-level canonicalization
-- 목적:
-- 1) 고려대 학과명을 크롤러 기준 canonical로 통일 (식품공학부/학부대학(공통) 정리)
-- 2) 크롤러 기준 누락 학과(사이버국방학과) 보완
-- 3) 의예과는 유지하되 alias 정책(의예과 ~= 의학과)으로 운영

begin;

with mapping as (
  select * from (
    values
      ('식품공학부', '식품공학과', '생명과학대학'),
      ('학부대학(공통)', '학부대학', '학부대학')
  ) as t(old_name, new_name, college_name)
),
korea_university as (
  select id
  from public.universities
  where name ilike '%고려%'
  limit 1
),
target_colleges as (
  select c.id, c.name
  from public.university_colleges c
  join korea_university u on u.id = c.university_id
),
missing_new_departments as (
  select distinct tc.id as college_id, m.new_name
  from mapping m
  join target_colleges tc on tc.name = m.college_name
  where not exists (
    select 1
    from public.university_departments d
    where d.college_id = tc.id
      and d.name = m.new_name
  )
),
inserted_new as (
  insert into public.university_departments (college_id, name)
  select college_id, new_name
  from missing_new_departments
  returning id
)
select count(*) from inserted_new;

-- 크롤러 기준 누락 학과 보완 (사이버국방학과)
insert into public.university_departments (college_id, name)
select c.id, '사이버국방학과'
from public.university_colleges c
join public.universities u on u.id = c.university_id
where u.name ilike '%고려%'
  and c.name = '스마트보안학부'
  and not exists (
    select 1
    from public.university_departments d
    where d.college_id = c.id
      and d.name = '사이버국방학과'
  );

-- 본전공 업데이트
with mapping as (
  select * from (
    values
      ('식품공학부', '식품공학과', '생명과학대학'),
      ('학부대학(공통)', '학부대학', '학부대학')
  ) as t(old_name, new_name, college_name)
),
korea_university as (
  select id
  from public.universities
  where name ilike '%고려%'
  limit 1
),
new_department as (
  select m.old_name, m.new_name, d.id as new_department_id
  from mapping m
  join public.university_colleges c on c.name = m.college_name
  join korea_university u on u.id = c.university_id
  join public.university_departments d on d.college_id = c.id and d.name = m.new_name
)
update public.profiles p
set department = nd.new_name,
    department_id = nd.new_department_id
from new_department nd
where p.university_id in (select id from korea_university)
  and (
    p.department = nd.old_name
    or p.department_id = (
      select d2.id
      from public.university_departments d2
      join public.university_colleges c2 on c2.id = d2.college_id
      where c2.university_id in (select id from korea_university)
        and d2.name = nd.old_name
      limit 1
    )
  );

-- 복수전공 업데이트
with mapping as (
  select * from (
    values
      ('식품공학부', '식품공학과', '생명과학대학'),
      ('학부대학(공통)', '학부대학', '학부대학')
  ) as t(old_name, new_name, college_name)
),
korea_university as (
  select id
  from public.universities
  where name ilike '%고려%'
  limit 1
),
new_department as (
  select m.old_name, m.new_name, d.id as new_department_id
  from mapping m
  join public.university_colleges c on c.name = m.college_name
  join korea_university u on u.id = c.university_id
  join public.university_departments d on d.college_id = c.id and d.name = m.new_name
)
update public.profiles p
set double_major_department = nd.new_name,
    double_major_department_id = nd.new_department_id
from new_department nd
where p.double_major_department = nd.old_name
   or p.double_major_department_id = (
      select d2.id
      from public.university_departments d2
      join public.university_colleges c2 on c2.id = d2.college_id
      where c2.university_id in (select id from korea_university)
        and d2.name = nd.old_name
      limit 1
   );

-- 사용자 참조가 모두 이동된 후 구 라벨 삭제
with mapping as (
  select * from (
    values
      ('식품공학부'),
      ('학부대학(공통)')
  ) as t(old_name)
),
korea_university as (
  select id
  from public.universities
  where name ilike '%고려%'
  limit 1
)
delete from public.university_departments d
using public.university_colleges c
where d.college_id = c.id
  and c.university_id in (select id from korea_university)
  and d.name in (select old_name from mapping)
  and not exists (
    select 1 from public.profiles p
    where p.department_id = d.id
       or p.double_major_department_id = d.id
  );

-- department_id 기반 텍스트 동기화 (안전)
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
