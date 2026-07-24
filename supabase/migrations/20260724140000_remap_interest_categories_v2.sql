-- 관심 직무 대분류 택소노미 v2 (11개 대분류)

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_interest_categories_valid;

ALTER TABLE public.contests
  DROP CONSTRAINT IF EXISTS contests_interest_categories_valid;

-- shared remap values (이전 직무 대분류 + 초창기 관심 분야)
-- new ids: dev_data_ai, pm, marketing, design, sales, hr_admin,
--          finance, manufacturing, rnd, cx_retail, media

-- profiles
UPDATE public.profiles
SET interest_categories = sub.mapped
FROM (
  SELECT
    p.id,
    CASE
      WHEN cardinality(arr.mapped) = 0 THEN NULL
      ELSE arr.mapped
    END AS mapped
  FROM public.profiles p
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (
        SELECT array_agg(x.new_id ORDER BY x.min_ord)
        FROM (
          SELECT m.new_id, min(u.ord) AS min_ord
          FROM unnest(p.interest_categories) WITH ORDINALITY AS u(old_id, ord)
          JOIN (
            VALUES
              ('planning', 'pm'),
              ('dev', 'dev_data_ai'),
              ('data_ai', 'dev_data_ai'),
              ('design', 'design'),
              ('content', 'media'),
              ('marketing', 'marketing'),
              ('business', 'pm'),
              ('engineering', 'rnd'),
              ('humanities', 'media'),
              ('education', 'hr_admin'),
              ('public', 'pm'),
              ('startup', 'pm'),
              ('dev_eng', 'dev_data_ai'),
              ('pm', 'pm'),
              ('sales_cx', 'sales'),
              ('hr_admin', 'hr_admin'),
              ('media', 'media'),
              ('research', 'rnd'),
              ('manufacturing', 'manufacturing'),
              ('hw_eng', 'rnd'),
              ('scm', 'cx_retail'),
              ('dev_data_ai', 'dev_data_ai'),
              ('sales', 'sales'),
              ('finance', 'finance'),
              ('rnd', 'rnd'),
              ('cx_retail', 'cx_retail')
          ) AS m(old_id, new_id) ON m.old_id = u.old_id
          GROUP BY m.new_id
        ) x
      ),
      ARRAY[]::text[]
    ) AS mapped
  ) arr
  WHERE p.interest_categories IS NOT NULL
) sub
WHERE public.profiles.id = sub.id;

-- contests
UPDATE public.contests
SET interest_categories = sub.mapped
FROM (
  SELECT
    c.id,
    CASE
      WHEN cardinality(arr.mapped) = 0 THEN NULL
      ELSE arr.mapped
    END AS mapped
  FROM public.contests c
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (
        SELECT array_agg(x.new_id ORDER BY x.min_ord)
        FROM (
          SELECT m.new_id, min(u.ord) AS min_ord
          FROM unnest(c.interest_categories) WITH ORDINALITY AS u(old_id, ord)
          JOIN (
            VALUES
              ('planning', 'pm'),
              ('dev', 'dev_data_ai'),
              ('data_ai', 'dev_data_ai'),
              ('design', 'design'),
              ('content', 'media'),
              ('marketing', 'marketing'),
              ('business', 'pm'),
              ('engineering', 'rnd'),
              ('humanities', 'media'),
              ('education', 'hr_admin'),
              ('public', 'pm'),
              ('startup', 'pm'),
              ('dev_eng', 'dev_data_ai'),
              ('pm', 'pm'),
              ('sales_cx', 'sales'),
              ('hr_admin', 'hr_admin'),
              ('media', 'media'),
              ('research', 'rnd'),
              ('manufacturing', 'manufacturing'),
              ('hw_eng', 'rnd'),
              ('scm', 'cx_retail'),
              ('dev_data_ai', 'dev_data_ai'),
              ('sales', 'sales'),
              ('finance', 'finance'),
              ('rnd', 'rnd'),
              ('cx_retail', 'cx_retail')
          ) AS m(old_id, new_id) ON m.old_id = u.old_id
          GROUP BY m.new_id
        ) x
      ),
      ARRAY[]::text[]
    ) AS mapped
  ) arr
  WHERE c.interest_categories IS NOT NULL
) sub
WHERE public.contests.id = sub.id;

-- crawled_contests.extracted_draft.interest_categories
UPDATE public.crawled_contests cc
SET extracted_draft = jsonb_set(
  cc.extracted_draft,
  '{interest_categories}',
  to_jsonb(COALESCE(sub.mapped, ARRAY[]::text[]))
)
FROM (
  SELECT
    c.id,
    (
      SELECT array_agg(x.new_id ORDER BY x.min_ord)
      FROM (
        SELECT m.new_id, min(u.ord) AS min_ord
        FROM jsonb_array_elements_text(c.extracted_draft -> 'interest_categories')
          WITH ORDINALITY AS u(old_id, ord)
        JOIN (
          VALUES
            ('planning', 'pm'),
            ('dev', 'dev_data_ai'),
            ('data_ai', 'dev_data_ai'),
            ('design', 'design'),
            ('content', 'media'),
            ('marketing', 'marketing'),
            ('business', 'pm'),
            ('engineering', 'rnd'),
            ('humanities', 'media'),
            ('education', 'hr_admin'),
            ('public', 'pm'),
            ('startup', 'pm'),
            ('dev_eng', 'dev_data_ai'),
            ('pm', 'pm'),
            ('sales_cx', 'sales'),
            ('hr_admin', 'hr_admin'),
            ('media', 'media'),
            ('research', 'rnd'),
            ('manufacturing', 'manufacturing'),
            ('hw_eng', 'rnd'),
            ('scm', 'cx_retail'),
            ('dev_data_ai', 'dev_data_ai'),
            ('sales', 'sales'),
            ('finance', 'finance'),
            ('rnd', 'rnd'),
            ('cx_retail', 'cx_retail')
        ) AS m(old_id, new_id) ON m.old_id = u.old_id
        GROUP BY m.new_id
      ) x
    ) AS mapped
  FROM public.crawled_contests c
  WHERE c.extracted_draft ? 'interest_categories'
    AND jsonb_typeof(c.extracted_draft -> 'interest_categories') = 'array'
) sub
WHERE cc.id = sub.id;

COMMENT ON COLUMN public.profiles.interest_categories IS
  '관심 직무 대분류 ID (dev_data_ai, pm, design, …). Empty/NULL = skipped; app enforces max 5.';

COMMENT ON COLUMN public.contests.interest_categories IS
  '관심 직무 대분류 ID (lib/interestCategories.ts).';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_interest_categories_valid
  CHECK (
    interest_categories IS NULL
    OR (
      cardinality(interest_categories) <= 5
      AND interest_categories <@ ARRAY[
        'dev_data_ai',
        'pm',
        'marketing',
        'design',
        'sales',
        'hr_admin',
        'finance',
        'manufacturing',
        'rnd',
        'cx_retail',
        'media'
      ]::text[]
    )
  );

ALTER TABLE public.contests
  ADD CONSTRAINT contests_interest_categories_valid
  CHECK (
    interest_categories IS NULL
    OR interest_categories <@ ARRAY[
      'dev_data_ai',
      'pm',
      'marketing',
      'design',
      'sales',
      'hr_admin',
      'finance',
      'manufacturing',
      'rnd',
      'cx_retail',
      'media'
    ]::text[]
  );
