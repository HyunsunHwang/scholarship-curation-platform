-- 재단법인 석성장학회 "특별장학생" 특수요건 보정.
-- 공고 기준: 국가와 국민을 위해 헌신하다가 순직한 자의 유자녀학생,
-- 탈북자 및 다문화 가정학생.

ALTER TYPE public.special_info_type ADD VALUE IF NOT EXISTS '순직자유자녀';

UPDATE public.scholarships
SET qual_special_info = ARRAY[
      '순직자유자녀'::public.special_info_type,
      '북한이탈주민'::public.special_info_type,
      '새터민'::public.special_info_type,
      '다문화가정'::public.special_info_type
    ]
WHERE name = '특별장학생'
  AND organization = '재단법인 석성장학회';
