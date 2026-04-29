-- 서울독립유공자후손장학금 전용 특수 자격 추가 및 매핑.
-- 기존 "보훈대상자"와는 다른 범주입니다. 공고상 참전유공자 등 기타 보훈대상은 제외됩니다.
ALTER TYPE public.special_info_type ADD VALUE IF NOT EXISTS '독립유공자후손';

UPDATE public.scholarships
SET qual_special_info = ARRAY['독립유공자후손'::public.special_info_type]
WHERE name = '서울독립유공자후손장학금'
  AND organization = '(재)서울미래인재재단';
