-- 특수정보 "장애인"을 "장애인(본인)", "장애인(가정)"으로 분리
-- - 기존 데이터의 레거시 "장애인" 값을 본인/가정으로 이관
-- - 이후 레거시 값 재입력 방지

UPDATE public.profiles p
SET special_info = nullif(
  ARRAY(
    SELECT DISTINCT mapped_value
    FROM (
      SELECT
        CASE
          WHEN btrim(value) = '장애인' THEN '장애인(본인)'
          ELSE btrim(value)
        END AS mapped_value
      FROM unnest(coalesce(p.special_info::text[], '{}'::text[])) AS value

      UNION ALL

      SELECT '장애인(가정)'
      FROM unnest(coalesce(p.special_info::text[], '{}'::text[])) AS value
      WHERE btrim(value) = '장애인'
    ) mapped
    WHERE mapped_value <> ''
  ),
  '{}'::text[]
)::public.special_info_type[]
WHERE p.special_info IS NOT NULL
  AND '장애인' = ANY(p.special_info::text[]);

UPDATE public.scholarships s
SET qual_special_info = nullif(
  ARRAY(
    SELECT DISTINCT mapped_value
    FROM (
      SELECT
        CASE
          WHEN btrim(value) = '장애인' THEN '장애인(본인)'
          ELSE btrim(value)
        END AS mapped_value
      FROM unnest(coalesce(s.qual_special_info, '{}'::text[])) AS value

      UNION ALL

      SELECT '장애인(가정)'
      FROM unnest(coalesce(s.qual_special_info, '{}'::text[])) AS value
      WHERE btrim(value) = '장애인'
    ) mapped
    WHERE mapped_value <> ''
  ),
  '{}'::text[]
)
WHERE s.qual_special_info IS NOT NULL
  AND '장애인' = ANY(s.qual_special_info);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_special_info_no_legacy_disabled_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_special_info_no_legacy_disabled_check
  CHECK (
    special_info IS NULL
    OR NOT ('장애인' = ANY(special_info::text[]))
  );

ALTER TABLE public.scholarships
  DROP CONSTRAINT IF EXISTS scholarships_qual_special_info_no_legacy_disabled_check;

ALTER TABLE public.scholarships
  ADD CONSTRAINT scholarships_qual_special_info_no_legacy_disabled_check
  CHECK (
    qual_special_info IS NULL
    OR NOT ('장애인' = ANY(qual_special_info))
  );
