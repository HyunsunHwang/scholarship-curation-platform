-- ══════════════════════════════════════════════════════════════════════════
-- 장학금 목록 로딩 최적화
-- Supabase SQL Editor 에서 전체 실행
-- ══════════════════════════════════════════════════════════════════════════

-- 북마크 수 집계와 사용자별 북마크 조회를 빠르게 처리
CREATE INDEX IF NOT EXISTS idx_bookmarks_scholarship_id
  ON public.bookmarks (scholarship_id);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id_created_at
  ON public.bookmarks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id_scholarship_id
  ON public.bookmarks (user_id, scholarship_id);

-- 홈 목록 필터/정렬 최적화
CREATE INDEX IF NOT EXISTS idx_scholarships_home_listing
  ON public.scholarships (
    is_verified,
    list_on_home,
    apply_end_date,
    is_recommended DESC,
    recommended_sort_order ASC
  );

-- 여러 장학금의 스크랩 수를 row 전체 전송 없이 DB에서 집계
CREATE OR REPLACE FUNCTION public.get_scholarship_scrap_counts(
  p_scholarship_ids integer[]
)
RETURNS TABLE (
  scholarship_id integer,
  scrap_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.scholarship_id,
    COUNT(*)::bigint AS scrap_count
  FROM public.bookmarks b
  WHERE b.scholarship_id = ANY(p_scholarship_ids)
  GROUP BY b.scholarship_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_scholarship_scrap_counts(integer[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_scholarship_scrap_counts(integer[]) TO authenticated;

SELECT
  'get_scholarship_scrap_counts' AS func,
  'created' AS status;
