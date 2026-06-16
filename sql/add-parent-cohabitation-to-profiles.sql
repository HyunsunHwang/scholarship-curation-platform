-- 온보딩 1단계: 부모님 동거 여부/주소 수집 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_cohabitation text,
  ADD COLUMN IF NOT EXISTS parent_address text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_parent_cohabitation_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_parent_cohabitation_check
  CHECK (parent_cohabitation IS NULL OR parent_cohabitation IN ('동거', '별거'));

COMMENT ON COLUMN public.profiles.parent_cohabitation
  IS '부모님과 동거 여부: 동거 | 별거';
COMMENT ON COLUMN public.profiles.parent_address
  IS '부모님 주소(부모님과 별거일 때 입력)';
