-- 홈 전체 장학금 목록에서 관리자가 지정한 “추천” 장학금을 상단에 노출
ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recommended_sort_order integer NULL;

COMMENT ON COLUMN public.scholarships.is_recommended IS '홈 전체 장학금 목록에서 상단(추천) 노출';
COMMENT ON COLUMN public.scholarships.recommended_sort_order IS '추천 항목 정렬: 작을수록 앞; null은 추천 그룹 내 맨 뒤';
