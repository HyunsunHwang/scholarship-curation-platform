-- 온보딩 학적사항: 직전학기 이수학점 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_semester_earned_credits numeric;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_last_semester_earned_credits_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_last_semester_earned_credits_check
  CHECK (
    last_semester_earned_credits IS NULL
    OR (
      last_semester_earned_credits >= 0
      AND last_semester_earned_credits <= 30
    )
  );

COMMENT ON COLUMN public.profiles.last_semester_earned_credits
  IS '직전 학기 이수학점 (0~30)';
