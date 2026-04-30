-- Public scholarship scrap counts must be global counts, not the current user's
-- RLS-filtered bookmark rows. The function exposes only aggregated counts for
-- requested scholarship IDs; individual bookmark ownership remains protected.

CREATE OR REPLACE FUNCTION public.get_scholarship_scrap_counts(
  p_scholarship_ids integer[]
)
RETURNS TABLE (
  scholarship_id integer,
  scrap_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
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
