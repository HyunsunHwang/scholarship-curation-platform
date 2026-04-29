-- 한미교육위원단(Fulbright Korea) 대학원 장학 프로그램은 대학원 진학 예정자를 대상으로 봅니다.
-- 서비스 매칭에서는 4학년 1학기 이상 또는 졸업예정/졸업 상태부터 노출합니다.
UPDATE public.scholarships
SET qual_min_academic_year = 4,
    qual_min_academic_semester = 1
WHERE organization = '한미교육위원단 (Fulbright Korea)'
  AND name IN (
    '2027 대학원 장학 프로그램 (인문·사회과학·예체능)',
    '2027 대학원 장학 프로그램 (이공계)'
  );
