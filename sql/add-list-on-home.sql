-- 홈 전체 목록 노출 여부 (맞춤 전용 장학금)
-- 이미 적용된 경우 생략 가능
ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS list_on_home boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.scholarships.list_on_home IS
  'true: 홈 전체 장학금 목록에 표시. false: 맞춤 장학금(RPC)에서만 노출.';
