-- 온보딩 학적사항: 입학 구분(일반입학/편입학/재입학) 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admission_type text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_admission_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_admission_type_check
  CHECK (
    admission_type IS NULL
    OR admission_type IN ('일반입학', '편입학', '재입학')
  );

COMMENT ON COLUMN public.profiles.admission_type
  IS '입학 구분: 일반입학 | 편입학 | 재입학';
