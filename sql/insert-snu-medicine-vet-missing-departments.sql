-- 서울대학교 의과대학/수의과대학 예과-본과 짝 학과 누락 보완
-- (이화여대 의과대학 의학과 누락 건과 동일 패턴으로 org_units 전수 감사 중 발견)
--
-- 1) 의과대학: '의학과'만 있고 '의예과' 누락
--    "의과대학 교육과정은 의예과 2년과 의학과 4년을 합해서 총 6년의 과정"
--    https://snuarori.snu.ac.kr/campus-life/majors?dataidx=2&md=view
--    (2027학년도 신입생부터 통합모집 예정이나, 재학생 기준 현재도 의예과/의학과 분리 운영)
--
-- 2) 수의과대학: '수의예과'만 있고 '수의학과' 누락
--    "수의과대학은 PVM 2년과 VM 4년의 총 6년제 교육과정... 수의예과 72학점, 수의학과 148학점"
--    https://vet.snu.ac.kr/avma-coe-accreditation-status/
--
-- 참고: 서울대는 이 저장소의 크롤러 대상 대학(cau/ewha/hanyang/hongik/khu/korea/skku/uos/yonsei)에
-- 포함되지 않으므로 notice-sources.csv 반영은 해당 없음. org_units는 장학금 대상 학과
-- 매칭(scholarship_target_units)에도 쓰이므로 누락 시 매칭 정확도에 영향을 줄 수 있음.

begin;

-- 1) 의예과
with medicine_college as (
  select legacy_id as college_id
  from public.org_units
  where id = 66 and legacy_table = 'university_colleges'
)
insert into public.university_departments (college_id, name)
select college_id, '의예과'
from medicine_college
where not exists (
  select 1
  from public.university_departments d
  where d.college_id = (select college_id from medicine_college)
    and d.name = '의예과'
);

insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select pc.id, 'department', d.name, '의약', 'university_departments', d.id
from public.university_departments d
join public.org_units pc on pc.id = 66
where d.college_id = pc.legacy_id
  and d.name = '의예과'
  and not exists (
    select 1 from public.org_units ou
    where ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
  );

-- 2) 수의학과
with vet_college as (
  select legacy_id as college_id
  from public.org_units
  where id = 63 and legacy_table = 'university_colleges'
)
insert into public.university_departments (college_id, name)
select college_id, '수의학과'
from vet_college
where not exists (
  select 1
  from public.university_departments d
  where d.college_id = (select college_id from vet_college)
    and d.name = '수의학과'
);

insert into public.org_units (parent_id, unit_type, name, field_code, legacy_table, legacy_id)
select pc.id, 'department', d.name, '의약', 'university_departments', d.id
from public.university_departments d
join public.org_units pc on pc.id = 63
where d.college_id = pc.legacy_id
  and d.name = '수의학과'
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
where d.name in ('의예과', '의학과', '수의예과', '수의학과')
  and ou.parent_id in (63, 66)
order by ou.parent_id, d.name;
