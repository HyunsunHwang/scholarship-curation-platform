-- 기관 담당자 가입 요청 테이블 및 프로필 확장
-- 실행 후 관리자 페이지(/admin/org-signup-requests)에서 승인/반려할 수 있습니다.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_org_manager boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS org_affiliation_kind text,
  ADD COLUMN IF NOT EXISTS org_affiliation_name text,
  ADD COLUMN IF NOT EXISTS org_approved_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_org_affiliation_kind_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_org_affiliation_kind_check
  CHECK (
    org_affiliation_kind IS NULL
    OR org_affiliation_kind IN ('학과', '학교', '재단', '기타')
  );

CREATE TABLE IF NOT EXISTS public.org_signup_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  applicant_name text NOT NULL,
  organization_kind text NOT NULL,
  organization_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  request_note text NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_signup_requests
  DROP CONSTRAINT IF EXISTS org_signup_requests_organization_kind_check;

ALTER TABLE public.org_signup_requests
  ADD CONSTRAINT org_signup_requests_organization_kind_check
  CHECK (organization_kind IN ('학과', '학교', '재단', '기타'));

ALTER TABLE public.org_signup_requests
  DROP CONSTRAINT IF EXISTS org_signup_requests_status_check;

ALTER TABLE public.org_signup_requests
  ADD CONSTRAINT org_signup_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_signup_requests_pending_email
  ON public.org_signup_requests (lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_org_signup_requests_status_requested_at
  ON public.org_signup_requests (status, requested_at DESC);

ALTER TABLE public.org_signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_signup_requests_insert_public" ON public.org_signup_requests;
CREATE POLICY "org_signup_requests_insert_public"
ON public.org_signup_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'pending'
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND review_note IS NULL
);

DROP POLICY IF EXISTS "org_signup_requests_select_admin" ON public.org_signup_requests;
CREATE POLICY "org_signup_requests_select_admin"
ON public.org_signup_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "org_signup_requests_update_admin" ON public.org_signup_requests;
CREATE POLICY "org_signup_requests_update_admin"
ON public.org_signup_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);
