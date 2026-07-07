-- 성균관대학교 org_units 전수 감사 중 발견: 구조 오류 2건 + field_code 결측 5건 수정
-- (검색 근거는 각 섹션에 명시)
--
-- 1) "글로벌리더학부" 중복 등록 (id=95, 독립 단과대학)
--    성균관대 학칙 제4조는 단과대학을 학부대학 + 15개 대학(유학/문과/사회과학/경제/
--    경영/자연과학/정보통신/소프트웨어융합/공과/약학/사범/생명공학/스포츠과학/의과/
--    예술) + 성균융합원(특례)으로 규정하며 "글로벌리더학부"는 이 목록에 없음.
--    사회과학대학 홈페이지(sscience.skku.edu) 확인: "사회과학대학은 현재 학부 과정에서
--    글로벌리더학부 1개 학부와 …8개 학과"로 서술 — 글로벌리더학부는 사회과학대학
--    소속 학부이며, 이미 id=503(legacy_id=343)으로 사회과학대학(81) 하위에 정상 등록됨.
--    id=95(legacy_id=102, university_colleges)는 소속 학과 0개, org_unit_aliases/
--    scholarship_target_units/profiles 참조 0건인 빈 중복 최상위 항목.
--    또한 notice-sources.csv에서 skku_087(id=95)과 skku_029(id=503)가 동일 URL
--    (https://gld.skku.edu/gld/community/notice.do)을 중복 크롤링하고 있어 공지가
--    두 org_unit에 중복 귀속되는 문제도 있었음 (skku_087 행은 별도로 CSV에서 제거).
--
-- 2) 경제대학 산하 대학원 전용 학과 2건이 학부 학과처럼 등재됨
--    경제대학 학장 인터뷰(총동창회, swb.skku.edu): "경제대학 학부는 3개 학과(경제,
--    통계, 글로벌경제학과)로 구성" / "대학원은 일반대학원 경제학과, 통계학과,
--    퀀트응용경제학과, 무역학과로 구성". 즉 퀀트응용경제학과(2020년 대학원 신설,
--    ecostat.skku.edu/ecostat/history.do)와 무역학과는 대학원에만 존재하고 학부
--    모집단위가 아님.
--    id=1123(퀀트응용경제학과), id=1124(무역학과) 모두 legacy_table/legacy_id가 null로
--    원본 university_departments 테이블에 대응 레코드가 없이 수동 추가되었고, 참조
--    (aliases/target_units/profiles) 0건 확인. 공지 URL도 학과 전용 페이지가 아니라
--    경제학과/통계학과와 동일한 경제대학 공용 게시판을 재사용하고 있었음
--    (skku_066/skku_067 행은 별도로 CSV에서 제거).
--
-- 3) field_code 결측 5건: 형제 학과(또는 소속 학과 전체)는 값이 있는데 이 항목만 null
--    79  유학대학(college)         -> 인문 (유일 소속 학과 유학·동양학과=인문)
--    94  성균융합원(college)       -> 공학 (소속 학과 4개: 글로벌바이오메디컬공학과/
--                                          배터리학과/에너지학과/응용AI융합학부=공학)
--    509 아동·청소년학과           -> 사회 (사회과학대학 형제 8개 학과 전부 사회)
--    525 영상학과, 526 의상학과   -> 예체능 (예술대학 형제 5개 학과 전부 예체능)
--
--    제외: 507 소비자학과(field_code=자연)는 오분류로 의심했으나, 서울대·이화여대의
--    동일 학과도 모두 자연으로 일관되게 분류되어 있어 DB 전체의 의도된 규칙으로 확인,
--    수정하지 않음. 78 학부대학/491 자유전공계열은 여러 계열이 혼재된 학부/전공이라
--    (한양대 감사 스크립트와 동일한 이유로) college/학과 레벨 단일 field_code를
--    부여하지 않고 null 유지.

begin;

-- 1) "글로벌리더학부" 중복 최상위 단과대학 제거 (참조 0건 확인됨)
delete from public.org_units
where id = 95
  and name = '글로벌리더학부'
  and unit_type = 'college'
  and not exists (
    select 1 from public.org_units child where child.parent_id = 95
  );

-- 2) 경제대학 대학원 전용 학과 2건 제거 (참조 0건 확인됨)
delete from public.org_units
where id in (1123, 1124)
  and legacy_table is null
  and legacy_id is null;

-- 3) field_code 결측 보완
update public.org_units
set field_code = '인문'
where id = 79 and field_code is null;

update public.org_units
set field_code = '공학'
where id = 94 and field_code is null;

update public.org_units
set field_code = '사회'
where id = 509 and field_code is null;

update public.org_units
set field_code = '예체능'
where id in (525, 526) and field_code is null;

commit;

-- 검증
select id, parent_id, unit_type, name, field_code, path_ids
from public.org_units
where id in (95, 1123, 1124, 79, 94, 509, 525, 526)
   or parent_id = 81
order by id;
