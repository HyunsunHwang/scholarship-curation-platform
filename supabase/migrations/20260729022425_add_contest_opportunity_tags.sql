ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS interest_industries text[] NULL;

COMMENT ON COLUMN public.contests.interest_industries IS
  '관심 산업 ID (lib/interestIndustries.ts). 자동 분류 후 관리자 검수 가능.';

ALTER TABLE public.contests
  DROP CONSTRAINT IF EXISTS contests_interest_industries_valid;

ALTER TABLE public.contests
  ADD CONSTRAINT contests_interest_industries_valid
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

CREATE INDEX IF NOT EXISTS contests_interest_categories_gin_idx
  ON public.contests USING gin (interest_categories);

CREATE INDEX IF NOT EXISTS contests_interest_industries_gin_idx
  ON public.contests USING gin (interest_industries);

CREATE TABLE IF NOT EXISTS public.contest_tagging_metadata (
  contest_id bigint PRIMARY KEY
    REFERENCES public.contests(id) ON DELETE CASCADE,
  taxonomy_version text NOT NULL,
  classifier_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'auto_tagged', 'needs_review', 'not_applicable', 'approved')),
  confidence numeric(4, 3) NULL
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  tagging_source text NOT NULL DEFAULT 'automatic'
    CHECK (tagging_source IN ('automatic', 'manual')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contest_tagging_metadata IS
  '공고 직무·산업 태깅 버전, 신뢰도, 근거와 관리자 검수 상태. 공개 추천 데이터와 분리.';

CREATE INDEX IF NOT EXISTS contest_tagging_metadata_status_idx
  ON public.contest_tagging_metadata (status, updated_at DESC);

ALTER TABLE public.contest_tagging_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contest_tagging_metadata_admin_select
  ON public.contest_tagging_metadata;
CREATE POLICY contest_tagging_metadata_admin_select
  ON public.contest_tagging_metadata
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS contest_tagging_metadata_admin_insert
  ON public.contest_tagging_metadata;
CREATE POLICY contest_tagging_metadata_admin_insert
  ON public.contest_tagging_metadata
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS contest_tagging_metadata_admin_update
  ON public.contest_tagging_metadata;
CREATE POLICY contest_tagging_metadata_admin_update
  ON public.contest_tagging_metadata
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS contest_tagging_metadata_admin_delete
  ON public.contest_tagging_metadata;
CREATE POLICY contest_tagging_metadata_admin_delete
  ON public.contest_tagging_metadata
  FOR DELETE TO authenticated
  USING (is_admin());

DROP TRIGGER IF EXISTS trg_contest_tagging_metadata_updated_at
  ON public.contest_tagging_metadata;
CREATE TRIGGER trg_contest_tagging_metadata_updated_at
  BEFORE UPDATE ON public.contest_tagging_metadata
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
