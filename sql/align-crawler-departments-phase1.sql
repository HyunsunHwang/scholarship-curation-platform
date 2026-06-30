-- Phase 1: crawler-based normalization (safe subset)
-- 목적:
-- 1) 중앙대 학과명 중 크롤러/공식 사이트와 불일치한 항목 정정
-- 2) 신설 학과(지능형반도체공학과) 누락 보완
-- 3) 기존 유저 프로필의 department 텍스트를 canonical 값으로 동기화

begin;

-- 1) 중앙대 학과명 정정: 광고홍보학부 -> 광고홍보학과
update public.university_departments d
set name = '광고홍보학과'
from public.university_colleges c
join public.universities u on u.id = c.university_id
where d.college_id = c.id
  and u.name ilike '%중앙%'
  and d.name = '광고홍보학부'
  and not exists (
    select 1
    from public.university_departments d2
    where d2.college_id = d.college_id
      and d2.name = '광고홍보학과'
  );

-- 2) 중앙대 학과명 정정: 식품영양전공 -> 식품영양학전공
update public.university_departments d
set name = '식품영양학전공'
from public.university_colleges c
join public.universities u on u.id = c.university_id
where d.college_id = c.id
  and u.name ilike '%중앙%'
  and d.name = '식품영양전공'
  and not exists (
    select 1
    from public.university_departments d2
    where d2.college_id = d.college_id
      and d2.name = '식품영양학전공'
  );

-- 3) 중앙대 지능형반도체공학과 누락 보완
insert into public.university_departments (college_id, name)
select c.id, '지능형반도체공학과'
from public.university_colleges c
join public.universities u on u.id = c.university_id
where u.name ilike '%중앙%'
  and c.name = '창의ICT공과대학'
  and not exists (
    select 1
    from public.university_departments d
    where d.college_id = c.id
      and d.name = '지능형반도체공학과'
  );

-- 4) 기존 유저 프로필 동기화: department_id 기준 canonical name으로 텍스트 업데이트
update public.profiles p
set department = d.name
from public.university_departments d
where p.department_id = d.id
  and p.department is distinct from d.name;

-- 5) 기존 유저 프로필 보완: id가 비어 있고 text+university가 정확히 일치하는 경우 id 채움
update public.profiles p
set department_id = d.id,
    department = d.name
from public.university_colleges c
join public.university_departments d on d.college_id = c.id
where p.department_id is null
  and p.university_id is not null
  and p.university_id = c.university_id
  and p.department = d.name;

commit;
