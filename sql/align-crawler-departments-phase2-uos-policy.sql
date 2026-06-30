-- UOS policy alignment (crawler-first)
-- 목적:
-- 1) 디자인/자유전공의 세부 트랙 표기를 상위 학부명 비교 기준으로 정규화
-- 2) 크롤러 기준 누락 학부명('융합전공학부')을 DB에 보강
-- 3) 기존 유저 문자열 필드(department, double_major_department)를 department_id 기준으로 동기화
--
-- 참고:
-- - 비교 스크립트 canonicalAliases:
--   디자인학과(산업디자인전공) -> 디자인학과
--   디자인학과(시각디자인전공) -> 디자인학과
--   자유전공학부(인문/자연) -> 자유전공학부
-- - 대학/단과대 명칭 변경 이력 대응을 위해 '첨단융합학부' 우선, 없으면 '자유융합대학'으로 탐색

begin;

with uos as (
  select id
  from public.universities
  where name ilike '%시립%'
  limit 1
),
target_college as (
  select c.id
  from public.university_colleges c
  join uos u on u.id = c.university_id
  where c.name in ('첨단융합학부', '자유융합대학')
  order by case when c.name = '첨단융합학부' then 0 else 1 end
  limit 1
)
insert into public.university_departments (college_id, name)
select c.id, '융합전공학부'
from target_college c
where not exists (
  select 1
  from public.university_departments d
  where d.college_id = c.id
    and d.name = '융합전공학부'
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
