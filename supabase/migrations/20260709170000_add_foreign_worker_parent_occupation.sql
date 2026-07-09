-- Add parent occupation option used by onboarding + scholarship quals.
ALTER TYPE public.parent_occupation_type ADD VALUE IF NOT EXISTS '외국인 근로자';
