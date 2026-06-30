-- Phase 2 (CAU): single-level canonicalization to crawler labels
-- 목적: 중앙대 학과 체계를 크롤러 라벨(학부/단일명) 기준으로 단일화

begin;

with mapping as (
  select * from (
    values
      ('건축공학전공', '건축학부', '공과대학'),
      ('건축학전공', '건축학부', '공과대학'),
      ('경영학전공', '경영학부', '경영경제대학'),
      ('나노소재공학전공', '융합공학부', '창의ICT공과대학'),
      ('바이오메디컬공학전공', '융합공학부', '창의ICT공과대학'),
      ('디지털미디어콘텐츠전공', '미디어커뮤니케이션학부', '사회과학대학'),
      ('발전기계전공', '에너지시스템공학부', '공과대학'),
      ('지능형반도체공학과', '지능형반도체공학부', '창의ICT공과대학')
  ) as t(old_name, new_name, college_name)
),
cau_university as (
  select id
  from public.universities
  where name ilike '%중앙%'
  limit 1
),
target_colleges as (
  select c.id, c.name
  from public.university_colleges c
  join cau_university u on u.id = c.university_id
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
inserted as (
  insert into public.university_departments (college_id, name)
  select college_id, new_name
  from missing_new_departments
  returning id
)
select count(*) from inserted;

-- 본전공 업데이트
with mapping as (
  select * from (
    values
      ('건축공학전공', '건축학부', '공과대학'),
      ('건축학전공', '건축학부', '공과대학'),
      ('경영학전공', '경영학부', '경영경제대학'),
      ('나노소재공학전공', '융합공학부', '창의ICT공과대학'),
      ('바이오메디컬공학전공', '융합공학부', '창의ICT공과대학'),
      ('디지털미디어콘텐츠전공', '미디어커뮤니케이션학부', '사회과학대학'),
      ('발전기계전공', '에너지시스템공학부', '공과대학'),
      ('지능형반도체공학과', '지능형반도체공학부', '창의ICT공과대학')
  ) as t(old_name, new_name, college_name)
),
cau_university as (
  select id
  from public.universities
  where name ilike '%중앙%'
  limit 1
),
new_department as (
  select m.old_name, m.new_name, d.id as new_department_id
  from mapping m
  join public.university_colleges c on c.name = m.college_name
  join cau_university u on u.id = c.university_id
  join public.university_departments d on d.college_id = c.id and d.name = m.new_name
)
update public.profiles p
set department = nd.new_name,
    department_id = nd.new_department_id
from new_department nd
where p.university_id in (select id from cau_university)
  and (p.department = nd.old_name or p.department_id = (
    select d2.id
    from public.university_departments d2
    join public.university_colleges c2 on c2.id = d2.college_id
    where c2.university_id in (select id from cau_university)
      and d2.name = nd.old_name
    limit 1
  ));

-- 복수전공 업데이트
with mapping as (
  select * from (
    values
      ('건축공학전공', '건축학부', '공과대학'),
      ('건축학전공', '건축학부', '공과대학'),
      ('경영학전공', '경영학부', '경영경제대학'),
      ('나노소재공학전공', '융합공학부', '창의ICT공과대학'),
      ('바이오메디컬공학전공', '융합공학부', '창의ICT공과대학'),
      ('디지털미디어콘텐츠전공', '미디어커뮤니케이션학부', '사회과학대학'),
      ('발전기계전공', '에너지시스템공학부', '공과대학'),
      ('지능형반도체공학과', '지능형반도체공학부', '창의ICT공과대학')
  ) as t(old_name, new_name, college_name)
),
cau_university as (
  select id
  from public.universities
  where name ilike '%중앙%'
  limit 1
),
new_department as (
  select m.old_name, m.new_name, d.id as new_department_id
  from mapping m
  join public.university_colleges c on c.name = m.college_name
  join cau_university u on u.id = c.university_id
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
      where c2.university_id in (select id from cau_university)
        and d2.name = nd.old_name
      limit 1
   );

-- 사용자 참조가 모두 이동된 후 구 라벨 삭제
with mapping as (
  select * from (
    values
      ('건축공학전공'),
      ('건축학전공'),
      ('경영학전공'),
      ('나노소재공학전공'),
      ('바이오메디컬공학전공'),
      ('디지털미디어콘텐츠전공'),
      ('발전기계전공'),
      ('지능형반도체공학과')
  ) as t(old_name)
),
cau_university as (
  select id
  from public.universities
  where name ilike '%중앙%'
  limit 1
)
delete from public.university_departments d
using public.university_colleges c
where d.college_id = c.id
  and c.university_id in (select id from cau_university)
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
