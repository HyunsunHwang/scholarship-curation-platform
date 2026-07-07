-- 경희대학교: 여러 전공/학과가 게시판을 공유하는 4개 그룹에 대해
-- 실제 상위 "학부" org_unit을 신설하고 재편한다.
--
-- 배경: notice-sources.csv에서 동일 URL을 2~3개의 서로 다른 department가
-- 각자 개별 소스로 중복 크롤링하고 있었다. 각 URL을 실제로 열어보면
-- 모두 "OOO학부"라는 단일 행정 단위 명의로 공지가 올라오는 공용 게시판이었고,
-- 그 학부가 org_units에 별도 노드로 존재하지 않아 세부 전공들이 college
-- 바로 아래 형제로 흩어져 있었다(서울시립대 자유융합대학과 동일한 패턴).
--
-- 각 학부는 소속 college 안에서 이 전공들만의 고유 그룹이며(college 자체를
-- 조상으로 쓰면 무관한 다른 학과까지 매칭 범위에 들어가 버리므로 college
-- 통합은 불가), 학부 단위의 중간 division 노드를 만드는 것이 유일하게
-- 정확한 해법이다.
--
-- 1) 공과대학(151) 산하 기계공학부: 기계공학전공(828), 지능로봇공학전공(825),
--    항공우주모빌리티전공(833) - https://me.khu.ac.kr
-- 2) 소프트웨어융합대학(153) 산하 컴퓨터공학부: 컴퓨터공학과(841), 인공지능학과(840)
--    - https://ce.khu.ac.kr
-- 3) 외국어대학(144) 산하 글로벌커뮤니케이션학부: 영미어문전공(791), 영미문화전공(790)
--    - https://com.khu.ac.kr/deptofenglish
-- 4) 정경대학(145) 산하 국제통상·금융투자학부: 국제통상학전공(798), 국제금융투자학전공(797)
--    - http://cominv.khu.ac.kr

begin;

insert into public.org_units (parent_id, unit_type, name, field_code) values
  (151, 'division', '기계공학부', '공학'),
  (153, 'division', '컴퓨터공학부', '공학'),
  (144, 'division', '글로벌커뮤니케이션학부', '인문'),
  (145, 'division', '국제통상·금융투자학부', '사회');

update public.org_units
set parent_id = (select id from public.org_units where name = '기계공학부' and unit_type = 'division' and parent_id = 151)
where id in (825, 828, 833);

update public.org_units
set parent_id = (select id from public.org_units where name = '컴퓨터공학부' and unit_type = 'division' and parent_id = 153)
where id in (840, 841);

update public.org_units
set parent_id = (select id from public.org_units where name = '글로벌커뮤니케이션학부' and unit_type = 'division' and parent_id = 144)
where id in (790, 791);

update public.org_units
set parent_id = (select id from public.org_units where name = '국제통상·금융투자학부' and unit_type = 'division' and parent_id = 145)
where id in (797, 798);

commit;

-- 검증
select id, parent_id, unit_type, name, field_code, path_ids
from public.org_units
where id in (825, 828, 833, 840, 841, 790, 791, 797, 798)
   or (parent_id in (151, 153, 144, 145) and unit_type = 'division')
order by id;
