-- (재)호국장학재단 "배려대상자" 장학금 조건 보정.
-- 공고 기준:
-- - 현역군인/군무원 자녀
-- - 다자녀, 공상자, 장애, 한부모 중 하나
-- - 성적 3.0/4.5 이상 (4.3 만점 기준 2.88 이상과 동등)

ALTER TYPE public.special_info_type ADD VALUE IF NOT EXISTS '공상자';

UPDATE public.scholarships
SET qual_special_info = ARRAY[
      '다자녀'::public.special_info_type,
      '공상자'::public.special_info_type,
      '장애인'::public.special_info_type,
      '한부모가정'::public.special_info_type
    ],
    qual_gpa_min = 3.0,
    qual_parent_occupation = ARRAY[
      '직업군인'::public.parent_occupation_type,
      '군무원'::public.parent_occupation_type
    ]
WHERE name = '배려대상자'
  AND organization = '(재)호국장학재단';
