-- 한양대학교 org_units field_code 누락 보완
--
-- 대상:
--   615 피아노과           -> 예체능 (음악대학 형제 학과와 동일)
--   1145 기술혁신대학     -> 공학   (공과대학 출신 재직자 융합공학 단과대)
--   625  산업융합학부     -> 공학
--
-- 제외:
--   6   한양대학교(university) -> field_code null 유지 (루트)
--   110 한양인터칼리지학부(college) -> 인문/자연 트랙을 아우르는 전공자율 프로그램이라
--                                    college 레벨 단일 field_code 부여하지 않음
--                                    (하위 623=인문, 624=자연 유지)

begin;

update public.org_units
set field_code = '예체능'
where id = 615 and field_code is null;

update public.org_units
set field_code = '공학'
where id in (1145, 625) and field_code is null;

commit;

-- 검증
select id, parent_id, unit_type, name, field_code
from public.org_units
where path_ids[1] = '6' and field_code is null
order by id;
