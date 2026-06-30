-- "새터민"을 "북한이탈주민"으로 통합
-- - 기존 데이터 치환
-- - 재입력 방지 제약 추가

UPDATE public.profiles p
SET special_info = nullif(
  ARRAY(
    SELECT DISTINCT
      CASE
        WHEN btrim(value) = '새터민' THEN '북한이탈주민'
        ELSE btrim(value)
      END
    FROM unnest(coalesce(p.special_info::text[], '{}'::text[])) AS value
    WHERE btrim(value) <> ''
  ),
  '{}'::text[]
)::public.special_info_type[]
WHERE p.special_info IS NOT NULL
  AND '새터민' = ANY(p.special_info::text[]);

UPDATE public.scholarships s
SET qual_special_info = nullif(
  ARRAY(
    SELECT DISTINCT
      CASE
        WHEN btrim(value) = '새터민' THEN '북한이탈주민'
        ELSE btrim(value)
      END
    FROM unnest(coalesce(s.qual_special_info, '{}'::text[])) AS value
    WHERE btrim(value) <> ''
  ),
  '{}'::text[]
)
WHERE s.qual_special_info IS NOT NULL
  AND '새터민' = ANY(s.qual_special_info);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_special_info_no_saeteomin_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_special_info_no_saeteomin_check
  CHECK (
    special_info IS NULL
    OR NOT ('새터민' = ANY(special_info::text[]))
  );

ALTER TABLE public.scholarships
  DROP CONSTRAINT IF EXISTS scholarships_qual_special_info_no_saeteomin_check;

ALTER TABLE public.scholarships
  ADD CONSTRAINT scholarships_qual_special_info_no_saeteomin_check
  CHECK (
    qual_special_info IS NULL
    OR NOT ('새터민' = ANY(qual_special_info))
  );
