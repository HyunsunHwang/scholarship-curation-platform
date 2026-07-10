-- Career GPS: profile interest categories for recommendation (skippable, max 5 in app).
-- Stores stable taxonomy IDs from lib/interestCategories.ts (not display labels).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interest_categories text[] DEFAULT NULL;

COMMENT ON COLUMN public.profiles.interest_categories IS
  'Interest taxonomy IDs (planning, dev, data_ai, …). Empty/NULL = skipped; app enforces max 5.';

-- Reject unknown IDs at the DB layer while keeping labels free to change in app code.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_interest_categories_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_interest_categories_valid
  CHECK (
    interest_categories IS NULL
    OR (
      cardinality(interest_categories) <= 5
      AND interest_categories <@ ARRAY[
        'planning',
        'dev',
        'data_ai',
        'design',
        'content',
        'marketing',
        'business',
        'engineering',
        'humanities',
        'education',
        'public',
        'startup'
      ]::text[]
    )
  );
