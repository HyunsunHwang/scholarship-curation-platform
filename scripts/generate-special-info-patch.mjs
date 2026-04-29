import fs from "node:fs";

const csvPath = String.raw`c:\Users\user\Downloads\Scholarship DB - 장학금_DB (6).csv`;
const outPath = String.raw`c:\Users\user\Downloads\cursor-projects-1\scholarship-curation-platform\sql\patch-special-info-from-csv-2026-04-29.sql`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function sqlStr(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(items) {
  if (items.length === 0) return "NULL::text[]";
  return `ARRAY[${items.map(sqlStr).join(", ")}]::text[]`;
}

const emptyMarkers = new Set([
  "",
  "제한없음",
  "제한 없음",
  "해당없음",
  "해당 없음",
  "공고 미기재",
  "미정",
  "※ 기관확인필요",
  "※ 자세한 사항은 첨부파일 또는 홈페이지 참고",
  "자세한 사항은 첨부파일 또는 홈페이지 참고",
]);

function cleanPiece(piece) {
  let value = String(piece ?? "").trim();
  if (value.startsWith("○")) value = value.slice(1).trim();
  if (value.startsWith("※")) value = value.slice(1).trim();
  return value
    .replaceAll("[제한사항]", "[제한]")
    .replace(/\s+/g, " ")
    .replace(/^[\s/,;·]+|[\s/,;·]+$/g, "");
}

function meaningful(piece) {
  const value = cleanPiece(piece);
  if (!value) return false;
  if (emptyMarkers.has(value)) return false;
  if (value.startsWith("자세한 사항은 첨부파일")) return false;
  if (value.startsWith("기관확인필요")) return false;
  return true;
}

function cleanSpecial(raw) {
  let value = String(raw ?? "").trim();
  if (!meaningful(value)) return [];

  value = value
    .replaceAll("※자세한", "※ 자세한")
    .replaceAll(" / [제한사항]", " / [제한]")
    .replaceAll(" / [제한]", "\n[제한] ")
    .replaceAll(" / ", "\n")
    .replaceAll("※ 자세한 사항은 첨부파일 또는 홈페이지 참고", "");

  value = value.replace(/○\s*/g, "\n");

  const seen = new Set();
  const rawPieces = [];
  for (const part of value.split("\n")) {
    const piece = cleanPiece(part);
    if (meaningful(piece)) rawPieces.push(piece);
  }

  const pieces = [];
  for (let index = 0; index < rawPieces.length; index += 1) {
    let piece = rawPieces[index];
    if (piece === "[제한]" && rawPieces[index + 1]) {
      piece = `[제한] ${rawPieces[index + 1]}`;
      index += 1;
    }
    if (!seen.has(piece)) {
      seen.add(piece);
      pieces.push(piece);
    }
  }
  return pieces;
}

const csvText = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(csvText);
const header = table[0];
const indexByHeader = Object.fromEntries(header.map((name, index) => [name, index]));

const rows = table
  .slice(1)
  .filter((row) => row.length > 1)
  .map((row) => ({
    id: (row[indexByHeader.ID] ?? "").trim(),
    name: (row[indexByHeader["장학금명"]] ?? "").trim(),
    organization: (row[indexByHeader["운영기관"]] ?? "").trim(),
    applyEndDate: (row[indexByHeader["접수마감일"]] ?? "").trim(),
    special: cleanSpecial(row[indexByHeader["자격_특수정보"]] ?? ""),
  }));

const values = rows
  .filter((row) => row.name && row.organization)
  .map((row) => `  (${sqlStr(row.id)}, ${sqlStr(row.name)}, ${sqlStr(row.organization)}, ${sqlTextArray(row.special)})`);

const sql = `-- CSV 장학금_DB (6) 기준: 접수마감일이 지나지 않은 기존 DB 장학금의 자격_특수정보 정리
-- 적용 기준일: 2026-04-29 (Asia/Seoul)
-- 상세 페이지 지원자격 > 기타 요건에 표시되도록 scholarships.qual_special_info(text[])에 반영합니다.

-- 자유서술형 특수요건을 담기 위해 장학금 쪽 qual_special_info를 text[]로 전환합니다.
-- profiles.special_info는 기존 special_info_type[] 그대로 유지합니다.
ALTER TABLE public.scholarships
  ALTER COLUMN qual_special_info TYPE text[]
  USING CASE
    WHEN qual_special_info IS NULL THEN NULL
    ELSE qual_special_info::text[]
  END;

-- 맞춤 매칭에서는 qual_special_info 중 프로필 enum 값과 정확히 일치하는 항목만 hard condition으로 사용합니다.
-- 그 외 자유서술형 문구는 상세 페이지 표시용으로만 취급하여 매칭을 막지 않습니다.
CREATE OR REPLACE FUNCTION public.get_matched_scholarships(p_user_id uuid)
 RETURNS SETOF scholarships
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH profile AS (
    SELECT
      p.*,
      u.name   AS resolved_university_name,
      ud.name  AS resolved_department_name,
      ud2.name AS resolved_double_major_name,
      uc.name  AS resolved_college_name,
      uc2.name AS resolved_double_major_college_name
    FROM public.profiles p
    LEFT JOIN public.universities          u   ON u.id   = p.university_id
    LEFT JOIN public.university_departments ud  ON ud.id  = p.department_id
    LEFT JOIN public.university_departments ud2 ON ud2.id = p.double_major_department_id
    LEFT JOIN public.university_colleges    uc  ON uc.id  = p.college_id
    LEFT JOIN public.university_colleges    uc2 ON uc2.id = p.double_major_college_id
    WHERE p.id = p_user_id
  )
  SELECT s.*
  FROM public.scholarships s
  CROSS JOIN profile p
  WHERE (auth.uid() = p_user_id OR public.is_admin())
    AND s.is_verified = true
    AND (
      s.apply_end_date = '9999-12-31'
      OR s.apply_end_date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date
    )
    AND (
      s.qual_university IS NULL
      OR cardinality(s.qual_university) = 0
      OR (p.resolved_university_name IS NOT NULL AND p.resolved_university_name = ANY(s.qual_university))
      OR (p.school_name IS NOT NULL AND p.school_name = ANY(s.qual_university))
    )
    AND (
      s.qual_school_location IS NULL
      OR cardinality(s.qual_school_location) = 0
      OR p.school_location = ANY(s.qual_school_location)
    )
    AND (
      s.qual_school_category IS NULL
      OR cardinality(s.qual_school_category) = 0
      OR p.school_category = ANY(s.qual_school_category)
    )
    AND (
      s.qual_enrollment_status IS NULL
      OR cardinality(s.qual_enrollment_status) = 0
      OR p.enrollment_status = ANY(s.qual_enrollment_status)
    )
    AND (
      s.qual_academic_year IS NULL
      OR cardinality(s.qual_academic_year) = 0
      OR p.academic_year = ANY(s.qual_academic_year)
    )
    AND (
      s.qual_min_academic_year IS NULL
      OR p.enrollment_status IN ('졸업예정'::public.enrollment_status_type, '졸업'::public.enrollment_status_type)
      OR (
        p.academic_year IS NOT NULL
        AND (
          p.academic_year > s.qual_min_academic_year
          OR (
            p.academic_year = s.qual_min_academic_year
            AND (
              s.qual_min_academic_semester IS NULL
              OR (p.academic_semester IS NOT NULL AND p.academic_semester >= s.qual_min_academic_semester)
            )
          )
        )
      )
    )
    AND (
      s.qual_major IS NULL
      OR cardinality(s.qual_major) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(s.qual_major) AS m
        WHERE
          (p.resolved_department_name IS NOT NULL AND (p.resolved_department_name ILIKE '%' || m || '%' OR m ILIKE '%' || p.resolved_department_name || '%'))
          OR (p.department IS NOT NULL AND (p.department ILIKE '%' || m || '%' OR m ILIKE '%' || p.department || '%'))
          OR (p.resolved_college_name IS NOT NULL AND (p.resolved_college_name ILIKE '%' || m || '%' OR m ILIKE '%' || p.resolved_college_name || '%'))
          OR (p.resolved_double_major_name IS NOT NULL AND (p.resolved_double_major_name ILIKE '%' || m || '%' OR m ILIKE '%' || p.resolved_double_major_name || '%'))
          OR (p.double_major_department IS NOT NULL AND (p.double_major_department ILIKE '%' || m || '%' OR m ILIKE '%' || p.double_major_department || '%'))
          OR (p.resolved_double_major_college_name IS NOT NULL AND (p.resolved_double_major_college_name ILIKE '%' || m || '%' OR m ILIKE '%' || p.resolved_double_major_college_name || '%'))
      )
    )
    AND (s.qual_gpa_min IS NULL OR (p.gpa IS NOT NULL AND p.gpa >= s.qual_gpa_min))
    AND (s.qual_gpa_last_semester_min IS NULL OR (p.gpa_last_semester IS NOT NULL AND p.gpa_last_semester >= s.qual_gpa_last_semester_min))
    AND (
      s.qual_income_level_max IS NULL
      OR (p.income_level IS NOT NULL AND p.income_level <= s.qual_income_level_max AND p.income_level >= COALESCE(s.qual_income_level_min, 1))
    )
    AND (s.qual_household_size_max IS NULL OR (p.household_size IS NOT NULL AND p.household_size <= s.qual_household_size_max))
    AND (s.qual_gender IS NULL OR p.gender = s.qual_gender)
    AND (s.qual_age_min IS NULL OR (p.birth_date IS NOT NULL AND DATE_PART('year', AGE((p.birth_date)::date)) >= s.qual_age_min))
    AND (s.qual_age_max IS NULL OR (p.birth_date IS NOT NULL AND DATE_PART('year', AGE((p.birth_date)::date)) <= s.qual_age_max))
    AND (
      s.qual_region IS NULL
      OR cardinality(s.qual_region) = 0
      OR (p.address IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(s.qual_region) AS r WHERE p.address ILIKE '%' || r || '%'))
    )
    AND (s.qual_nationality IS NULL OR p.nationality = s.qual_nationality)
    AND (
      s.qual_special_info IS NULL
      OR cardinality(s.qual_special_info) = 0
      OR NOT EXISTS (
        SELECT 1 FROM unnest(s.qual_special_info) AS req
        WHERE req = ANY(enum_range(NULL::public.special_info_type)::text[])
      )
      OR (p.special_info IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(s.qual_special_info) AS req
        WHERE req = ANY(p.special_info::text[])
      ))
    )
    AND (s.qual_parent_occupation IS NULL OR cardinality(s.qual_parent_occupation) = 0 OR (p.parent_occupation IS NOT NULL AND p.parent_occupation && s.qual_parent_occupation))
    AND (s.qual_military_status IS NULL OR p.military_status = s.qual_military_status)
  ORDER BY s.apply_end_date ASC;
$function$;

WITH csv_special(csv_id, name, organization, special) AS (
VALUES
${values.join(",\n")}
), matched AS (
  SELECT DISTINCT ON (s.id) s.id, c.csv_id, c.special
  FROM public.scholarships s
  JOIN csv_special c
    ON s.organization = c.organization
   AND (s.name = c.name OR s.name ILIKE '%' || c.name || '%' OR c.name ILIKE '%' || s.name || '%')
  WHERE s.apply_end_date >= DATE '2026-04-29'
     OR s.apply_end_date = DATE '9999-12-31'
  ORDER BY s.id, length(c.name) DESC
), updated AS (
  UPDATE public.scholarships s
  SET qual_special_info = m.special,
      updated_at = now()
  FROM matched m
  WHERE s.id = m.id
  RETURNING s.id, s.name, m.csv_id, s.qual_special_info
)
SELECT
  count(*) AS updated_count,
  count(*) FILTER (WHERE qual_special_info IS NOT NULL AND cardinality(qual_special_info) > 0) AS updated_with_special_info
FROM updated;
`;

fs.writeFileSync(outPath, sql, "utf8");

function isActiveByCsvDate(row) {
  if (row.applyEndDate === "상시접수") return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(row.applyEndDate) && row.applyEndDate >= "2026-04-29";
}

function updateSqlForValues(batchValues, batchNumber) {
  return `-- CSV 장학금_DB (6) 자격_특수정보 반영 배치 ${batchNumber}
WITH csv_special(csv_id, name, organization, special) AS (
VALUES
${batchValues.join(",\n")}
), matched AS (
  SELECT DISTINCT ON (s.id) s.id, c.csv_id, c.special
  FROM public.scholarships s
  JOIN csv_special c
    ON s.organization = c.organization
   AND (s.name = c.name OR s.name ILIKE '%' || c.name || '%' OR c.name ILIKE '%' || s.name || '%')
  WHERE s.apply_end_date >= DATE '2026-04-29'
     OR s.apply_end_date = DATE '9999-12-31'
  ORDER BY s.id, length(c.name) DESC
), updated AS (
  UPDATE public.scholarships s
  SET qual_special_info = m.special,
      updated_at = now()
  FROM matched m
  WHERE s.id = m.id
  RETURNING s.id, s.name, m.csv_id, s.qual_special_info
)
SELECT
  ${batchNumber} AS batch_number,
  count(*) AS updated_count,
  count(*) FILTER (WHERE qual_special_info IS NOT NULL AND cardinality(qual_special_info) > 0) AS updated_with_special_info
FROM updated;
`;
}

const activeValues = rows
  .filter((row) => row.name && row.organization && isActiveByCsvDate(row))
  .map((row) => `  (${sqlStr(row.id)}, ${sqlStr(row.name)}, ${sqlStr(row.organization)}, ${sqlTextArray(row.special)})`);

const batchSize = 25;
let batchCount = 0;
for (let start = 0; start < activeValues.length; start += batchSize) {
  batchCount += 1;
  const batchPath = outPath.replace(".sql", `-batch-${String(batchCount).padStart(2, "0")}.sql`);
  fs.writeFileSync(batchPath, updateSqlForValues(activeValues.slice(start, start + batchSize), batchCount), "utf8");
}

console.log(`rows=${rows.length}`);
console.log(`values=${values.length}`);
console.log(`active_values=${activeValues.length}`);
console.log(`batch_count=${batchCount}`);
console.log(`meaningful_special_rows=${rows.filter((row) => row.special.length > 0).length}`);
console.log(outPath);
