-- 이화여대 org_units 전수 감사 중 발견: 일부 '학부'가 실제로는 산하에
-- 별도 전공(트랙)을 두고 있는데(1~2학년 후 자율/배정으로 전공 결정), org_units에는
-- 학부 자체가 department(리프)로만 들어가 있어 전공 단위 구분이 불가능했다.
--
-- org_unit_type enum에 이미 'division'이 존재하고, app/onboarding/actions.ts에서도
-- "department가 아닌 곳(대학/단과대/학부)에서 멈췄다면 '미정' 상태로 복원한다"고
-- 문서화되어 있어(대학-단과대-학부-학과 4단계 지원), 학부를 division으로,
-- 개별 전공을 그 하위 department로 두는 것이 스키마의 원래 설계 의도와 일치한다.
--
-- 대상:
--   1) 간호대학 간호학부 -> 간호학전공, 글로벌건강간호학전공 (2014년 후자 신설)
--      https://ewha.ac.kr/ewha/academics/nursing.do
--   2) 스크랜튼대학 국제학부 -> 국제학전공, 글로벌한국학전공 (2015년 후자 신설, 1학년 말 자율선택)
--      https://scrantoncollege.ewha.ac.kr/scranton/international-studies/international-introduction.do
--   3) 조형예술대학 디자인학부 -> 공간디자인전공, 시각디자인전공, 산업디자인전공, 영상디자인전공
--      https://www.ewha.ac.kr/ewha/academics/art-design.do
--      (같은 단과대의 조형예술학부/섬유·패션학부는 이미 전공 단위로 org_units에 분리되어 있어
--       디자인학부만 전공 미분리 상태인 것은 일관성 문제이기도 했음)
--
-- 참고: 공과대학 융합전자반도체공학부는 전자전기공학전공/지능형반도체공학전공으로
-- 나뉘지만 align-crawler-departments-phase2-ewha-ai-policy.sql에 "학부 레벨로 운영"이
-- 명시된 의도적 정책이라 이번 분리 대상에서 제외함.

begin;

-- 1) 간호학부 -> division 전환 + 전공 2개 추가
update public.org_units
set unit_type = 'division'
where id = 674 and unit_type = 'department';

with nursing_division as (
  select id, legacy_id as legacy_dept_id, field_code
  from public.org_units where id = 674
),
nursing_college as (
  select d.college_id
  from public.university_departments d
  join nursing_division nd on nd.legacy_dept_id = d.id
)
insert into public.university_departments (college_id, name)
select college_id, m.name
from nursing_college, (values ('간호학전공'), ('글로벌건강간호학전공')) as m(name)
where not exists (
  select 1 from public.university_departments d
  where d.college_id = (select college_id from nursing_college) and d.name = m.name
);

insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select nd.id, 'department', d.name, nd.field_code, 'university_departments', d.id
from public.university_departments d
join public.org_units nd on nd.id = 674
join public.university_departments legacy_ref on legacy_ref.id = nd.legacy_id
where d.college_id = legacy_ref.college_id
  and d.name in ('간호학전공', '글로벌건강간호학전공')
  and not exists (
    select 1 from public.org_units ou
    where ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
  );

-- 2) 국제학부(스크랜튼대학) -> division 전환 + 전공 2개 추가
update public.org_units
set unit_type = 'division'
where id = 677 and unit_type = 'department';

with intl_division as (
  select id, legacy_id as legacy_dept_id, field_code
  from public.org_units where id = 677
),
intl_college as (
  select d.college_id
  from public.university_departments d
  join intl_division idv on idv.legacy_dept_id = d.id
)
insert into public.university_departments (college_id, name)
select college_id, m.name
from intl_college, (values ('국제학전공'), ('글로벌한국학전공')) as m(name)
where not exists (
  select 1 from public.university_departments d
  where d.college_id = (select college_id from intl_college) and d.name = m.name
);

insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select idv.id, 'department', d.name, idv.field_code, 'university_departments', d.id
from public.university_departments d
join public.org_units idv on idv.id = 677
join public.university_departments legacy_ref on legacy_ref.id = idv.legacy_id
where d.college_id = legacy_ref.college_id
  and d.name in ('국제학전공', '글로벌한국학전공')
  and not exists (
    select 1 from public.org_units ou
    where ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
  );

-- 3) 디자인학부(조형예술대학) -> division 전환 + 전공 4개 추가
update public.org_units
set unit_type = 'division'
where id = 692 and unit_type = 'department';

with design_division as (
  select id, legacy_id as legacy_dept_id, field_code
  from public.org_units where id = 692
),
design_college as (
  select d.college_id
  from public.university_departments d
  join design_division dd on dd.legacy_dept_id = d.id
)
insert into public.university_departments (college_id, name)
select college_id, m.name
from design_college,
  (values ('공간디자인전공'), ('시각디자인전공'), ('산업디자인전공'), ('영상디자인전공')) as m(name)
where not exists (
  select 1 from public.university_departments d
  where d.college_id = (select college_id from design_college) and d.name = m.name
);

insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select dd.id, 'department', d.name, dd.field_code, 'university_departments', d.id
from public.university_departments d
join public.org_units dd on dd.id = 692
join public.university_departments legacy_ref on legacy_ref.id = dd.legacy_id
where d.college_id = legacy_ref.college_id
  and d.name in ('공간디자인전공', '시각디자인전공', '산업디자인전공', '영상디자인전공')
  and not exists (
    select 1 from public.org_units ou
    where ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
  );

commit;

-- 검증
select
  parent.name as division_name,
  parent.unit_type as division_type,
  ou.name as major_name,
  ou.path_ids
from public.org_units ou
join public.org_units parent on parent.id = ou.parent_id
where parent.id in (674, 677, 692)
order by parent.id, ou.name;
