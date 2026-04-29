-- 2026-1학기 소망장학금은 장애인/특수교육대상자 학생 대상입니다.
-- 현재 특수 자격 enum에는 "특수교육대상자"가 별도 항목으로 없어,
-- 매칭 누수를 막기 위해 우선 "장애인" 특수 자격으로 제한합니다.
UPDATE public.scholarships
SET qual_special_info = ARRAY['장애인'::public.special_info_type]
WHERE name = '2026-1학기 소망장학금'
  AND organization = '고려대학교';
