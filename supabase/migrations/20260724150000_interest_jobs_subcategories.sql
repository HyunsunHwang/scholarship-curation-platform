-- 관심 직무: 대분류 → 세부 직무(InterestJobId) 저장으로 전환

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_interest_categories_valid;

ALTER TABLE public.contests
  DROP CONSTRAINT IF EXISTS contests_interest_categories_valid;

-- 세부 id만 남기고 대분류·레거시 값은 제거
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
        SELECT array_agg(f.job_id ORDER BY f.ord)
        FROM (
          SELECT DISTINCT ON (u.raw_id) u.raw_id AS job_id, u.ord
          FROM unnest(p.interest_categories) WITH ORDINALITY AS u(raw_id, ord)
          WHERE u.raw_id = ANY (ARRAY[
            'backend','frontend','mobile','game_dev','embedded','devops','qa','security',
            'data_analyst','data_engineer','data_scientist','ml_engineer',
            'service_pm','biz_strategy','bd','game_planning','consultant_jr',
            'brand_marketing','performance','content_sns','crm','growth','ae','pr','md',
            'ux_ui','graphic','motion','product_design','bx','web_publishing','space','fashion',
            'domestic','overseas','b2b','tech_sales','sales_ops','finance_sales',
            'hr','hrd','general_affairs','office_support','legal_jr','secretary',
            'accounting','tax','treasury','finance_ops',
            'production_mgmt','process_eng','qc','production_tech','equipment','ehs',
            'mechanical','ee','semiconductor','chem_materials','bio_pharma','rnd_general','civil_arch',
            'cs','platform_ops','retail','scm','procurement','fnb',
            'content_prod','pd','editor','broadcast_writer','publishing','mcn'
          ]::text[])
          ORDER BY u.raw_id, u.ord
        ) f
      ),
      ARRAY[]::text[]
    ) AS mapped
  ) arr
  WHERE p.interest_categories IS NOT NULL
) sub
WHERE public.profiles.id = sub.id;

-- contests: 세부만 유지 (키워드 재매칭은 스크립트에서 수행)
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
        SELECT array_agg(f.job_id ORDER BY f.ord)
        FROM (
          SELECT DISTINCT ON (u.raw_id) u.raw_id AS job_id, u.ord
          FROM unnest(c.interest_categories) WITH ORDINALITY AS u(raw_id, ord)
          WHERE u.raw_id = ANY (ARRAY[
            'backend','frontend','mobile','game_dev','embedded','devops','qa','security',
            'data_analyst','data_engineer','data_scientist','ml_engineer',
            'service_pm','biz_strategy','bd','game_planning','consultant_jr',
            'brand_marketing','performance','content_sns','crm','growth','ae','pr','md',
            'ux_ui','graphic','motion','product_design','bx','web_publishing','space','fashion',
            'domestic','overseas','b2b','tech_sales','sales_ops','finance_sales',
            'hr','hrd','general_affairs','office_support','legal_jr','secretary',
            'accounting','tax','treasury','finance_ops',
            'production_mgmt','process_eng','qc','production_tech','equipment','ehs',
            'mechanical','ee','semiconductor','chem_materials','bio_pharma','rnd_general','civil_arch',
            'cs','platform_ops','retail','scm','procurement','fnb',
            'content_prod','pd','editor','broadcast_writer','publishing','mcn'
          ]::text[])
          ORDER BY u.raw_id, u.ord
        ) f
      ),
      ARRAY[]::text[]
    ) AS mapped
  ) arr
  WHERE c.interest_categories IS NOT NULL
) sub
WHERE public.contests.id = sub.id;

COMMENT ON COLUMN public.profiles.interest_categories IS
  '관심 직무 세부 ID (InterestJobId). Empty/NULL = skipped; app enforces max 5.';

COMMENT ON COLUMN public.contests.interest_categories IS
  '관심 직무 세부 ID (InterestJobId). App suggests max 8.';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_interest_categories_valid
  CHECK (
    interest_categories IS NULL
    OR (
      cardinality(interest_categories) <= 5
      AND interest_categories <@ ARRAY[
        'backend','frontend','mobile','game_dev','embedded','devops','qa','security',
        'data_analyst','data_engineer','data_scientist','ml_engineer',
        'service_pm','biz_strategy','bd','game_planning','consultant_jr',
        'brand_marketing','performance','content_sns','crm','growth','ae','pr','md',
        'ux_ui','graphic','motion','product_design','bx','web_publishing','space','fashion',
        'domestic','overseas','b2b','tech_sales','sales_ops','finance_sales',
        'hr','hrd','general_affairs','office_support','legal_jr','secretary',
        'accounting','tax','treasury','finance_ops',
        'production_mgmt','process_eng','qc','production_tech','equipment','ehs',
        'mechanical','ee','semiconductor','chem_materials','bio_pharma','rnd_general','civil_arch',
        'cs','platform_ops','retail','scm','procurement','fnb',
        'content_prod','pd','editor','broadcast_writer','publishing','mcn'
      ]::text[]
    )
  );

ALTER TABLE public.contests
  ADD CONSTRAINT contests_interest_categories_valid
  CHECK (
    interest_categories IS NULL
    OR (
      cardinality(interest_categories) <= 8
      AND interest_categories <@ ARRAY[
        'backend','frontend','mobile','game_dev','embedded','devops','qa','security',
        'data_analyst','data_engineer','data_scientist','ml_engineer',
        'service_pm','biz_strategy','bd','game_planning','consultant_jr',
        'brand_marketing','performance','content_sns','crm','growth','ae','pr','md',
        'ux_ui','graphic','motion','product_design','bx','web_publishing','space','fashion',
        'domestic','overseas','b2b','tech_sales','sales_ops','finance_sales',
        'hr','hrd','general_affairs','office_support','legal_jr','secretary',
        'accounting','tax','treasury','finance_ops',
        'production_mgmt','process_eng','qc','production_tech','equipment','ehs',
        'mechanical','ee','semiconductor','chem_materials','bio_pharma','rnd_general','civil_arch',
        'cs','platform_ops','retail','scm','procurement','fnb',
        'content_prod','pd','editor','broadcast_writer','publishing','mcn'
      ]::text[]
    )
  );
