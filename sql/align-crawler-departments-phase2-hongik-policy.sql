-- Hongik policy alignment (crawler-first)
-- 목적:
-- 1) 크롤러 기준 누락 학과('건설환경공학과')를 공과대학에 보강
-- 2) 기존 유저 문자열 필드(department, double_major_department)를 department_id 기준으로 동기화
--
-- 참고:
-- - 홍익대는 학부/전공 표기가 혼재되어 있어 비교 스크립트에서 canonicalAliases로 정규화한다.
--   예) 디자인학부(시각디자인전공) -> 디자인학부
--       공연예술학부(뮤지컬전공) -> 뮤지컬전공
--       신소재화공시스템공학부(화학공학전공) -> 신소재화공시스템공학부
--       건축학전공(5년제), 실내건축학전공 -> 건축학부

begin;

with hongik as (
  select id
  from public.universities
  where name ilike '%홍익%'
  limit 1
),
engineering_college as (
  select c.id
  from public.university_colleges c
  join hongik u on u.id = c.university_id
  where c.name = '공과대학'
  limit 1
)
insert into public.university_departments (college_id, name)
select c.id, '건설환경공학과'
from engineering_college c
where not exists (
  select 1
  from public.university_departments d
  where d.college_id = c.id
    and d.name = '건설환경공학과'
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
