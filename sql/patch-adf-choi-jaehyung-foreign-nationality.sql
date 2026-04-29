-- ADF최재형장학생은 고려인 대상 장학금입니다.
-- 현재 국적 구분은 내국인/외국인만 있으므로, 내국인 매칭 누수를 막기 위해 외국인으로 제한합니다.
UPDATE public.scholarships
SET qual_nationality = '외국인'::public.nationality_type
WHERE name = 'ADF최재형장학생'
  AND organization = '아시아발전재단';
