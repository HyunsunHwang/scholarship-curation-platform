-- 관심 산업(분야) 복수 선택

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interest_industries text[] NULL;

COMMENT ON COLUMN public.profiles.interest_industries IS
  '관심 산업 대분류 ID (lib/interestIndustries.ts). NULL/빈 = 미선택.';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_interest_industries_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_interest_industries_valid
  CHECK (
    interest_industries IS NULL
    OR (
      cardinality(interest_industries) <= 5
      AND interest_industries <@ ARRAY[
        'it_software',
        'semiconductor',
        'electronics',
        'game',
        'finance_fintech',
        'manufacturing_chem',
        'battery_energy',
        'bio_pharma',
        'commerce_logistics',
        'media_entertainment',
        'marketing_agency',
        'consumer_goods',
        'public_edu_npo'
      ]::text[]
    )
  );
