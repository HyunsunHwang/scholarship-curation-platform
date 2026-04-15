-- 재학/휴학 매칭 보정 (Supabase SQL Editor에서 이미 적용된 경우 생략 가능)
--
-- 문제: qual_enrollment_status에 '재학' 등이 명시돼 있어도
--       프로필의 enrollment_status가 NULL이면 OR 조건으로 통과하던 구간이 있었음.
-- 해결: 제한이 있을 때는 반드시 프로필 값이 배열에 포함될 때만 통과.
--
--    AND (
--      COALESCE(array_length(s.qual_enrollment_status, 1), 0) = 0
--      OR (
--        p.enrollment_status IS NOT NULL
--        AND p.enrollment_status = ANY(s.qual_enrollment_status)
--      )
--    )
--
-- 전체 함수 정의는 Supabase 대시보드 → Database → Functions 에서 확인하거나
-- MCP execute_sql로 pg_get_functiondef('get_matched_scholarships') 조회.

-- 예: 진리프로그램(미디어) — 공지상 재학 필수인데 DB에 제한이 비어 있던 경우
UPDATE public.scholarships
SET qual_enrollment_status = ARRAY['재학']::enrollment_status_type[]
WHERE id = 176
  AND (
    qual_enrollment_status IS NULL
    OR array_length(qual_enrollment_status, 1) IS NULL
    OR array_length(qual_enrollment_status, 1) = 0
  );
