-- 서울시립대학교 "자유융합대학" 실제 상위 단과대학 신설 및 재편
--
-- 배경: 자유전공학부(173), 첨단융합학부(174), 융합전공학부(924)는 실제로는
-- 모두 "자유융합대학" 소속이지만, DB에는 이를 묶는 상위 college가 없어
-- 세 노드가 university(10) 바로 아래 형제(sibling)로 흩어져 있었다.
-- 이 때문에 대학 통합 게시판(clacds/college)이 174(첨단융합학부)에만
-- 태깅되면, 형제 관계인 173/924의 공지가 174 소속으로 오귀속되고
-- 실제 173/924 소속 학생에게는 매칭되지 않는 문제가 있었다.
--
-- 다른 단과대학(도시과학대학=171, 예술체육대학=172, 인공지능융합대학=40@yonsei 등)은
-- college가 실제 조상(ancestor)이라 college 레벨 통합 공지 소스가 path_ids
-- 매칭으로 모든 하위 학과에 정확히 도달한다. 이번 재편으로 자유융합대학도
-- 동일한 구조(college > division > department)로 맞춘다.

begin;

-- 1) 신설: 자유융합대학 (college, university=10 직속)
insert into public.org_units (parent_id, unit_type, name, field_code)
values (10, 'college', '자유융합대학', null);

-- 2) 자유전공학부(173): college -> division으로 재편입, 신설 college 하위로 이동
--    (하위에 인문/자연 두 전공(921,922)이 있어 혼합 field이므로 field_code는 null)
update public.org_units
set parent_id = (select id from public.org_units where name = '자유융합대학' and unit_type = 'college' and parent_id = 10),
    unit_type = 'division',
    field_code = null
where id = 173;

-- 3) 첨단융합학부(174): college -> division으로 재편입, 신설 college 하위로 이동
update public.org_units
set parent_id = (select id from public.org_units where name = '자유융합대학' and unit_type = 'college' and parent_id = 10),
    unit_type = 'division'
where id = 174;

-- 4) 융합전공학부(924): leaf department 유지, 신설 college 하위로 이동
update public.org_units
set parent_id = (select id from public.org_units where name = '자유융합대학' and unit_type = 'college' and parent_id = 10)
where id = 924;

commit;

-- 검증
select id, parent_id, unit_type, name, field_code, path_ids
from public.org_units
where id in (173, 174, 924, 921, 922, 923, 925, 926)
   or (name = '자유융합대학' and unit_type = 'college')
order by id;
