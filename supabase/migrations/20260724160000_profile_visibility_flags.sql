-- 프로필 공개 / 제안 적극 검토 플래그

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_profile_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_open_to_offers boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_profile_public IS
  '공개 프로필로 노출 허용 여부';

COMMENT ON COLUMN public.profiles.is_open_to_offers IS
  '맞춤 장학금·공고 제안을 적극 받을 의사';
