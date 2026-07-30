/**
 * Convert four-year scholarship notice research CSV into crawler notice-sources CSV.
 *
 * Usage:
 *   npx tsx scripts/build-four-year-notice-sources-csv.ts [input.csv] [output.csv]
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_KEYWORDS =
  "장학|장학금|학자금|등록금|scholarship|tuition|fellowship";

const HEADER = [
  "source_id",
  "university_slug",
  "college_name",
  "department_name",
  "org_unit_id",
  "source_level",
  "source_name",
  "list_url",
  "base_url",
  "list_item_selector",
  "link_selector",
  "title_selector",
  "date_selector",
  "detail_content_selector",
  "detail_date_selector",
  "notice_url_pattern",
  "keywords",
  "adapter",
  "enabled",
  "notes",
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function toCsvCell(value: string): string {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

const inputPath =
  process.argv[2] ??
  "reports/four-year-scholarship-notice-links-1785406027465.csv";
const outputPath = process.argv[3] ?? "data/notice-sources-four-year-univ.csv";

const raw = fs.readFileSync(path.resolve(inputPath), "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(raw);
if (table.length < 2) throw new Error("Input CSV has no data rows.");

const [header, ...body] = table;
const index = Object.fromEntries(header.map((name, i) => [name, i]));
for (const col of ["org_unit_id", "school_name", "scholarship_notice_url"]) {
  if (!(col in index)) throw new Error(`Missing column: ${col}`);
}

const outRows: string[][] = [];
let skippedEmpty = 0;

for (const row of body) {
  const orgUnitId = (row[index.org_unit_id] ?? "").trim();
  const schoolName = (row[index.school_name] ?? "").trim();
  const listUrl = (row[index.scholarship_notice_url] ?? "").trim();
  const confidence = (row[index.confidence] ?? "").trim();
  const note = (row[index.note] ?? "").trim();

  if (!orgUnitId || !schoolName) continue;
  if (!listUrl.startsWith("http")) {
    skippedEmpty += 1;
    continue;
  }

  const slug = `ou_${orgUnitId}`;
  const notesParts = [
    confidence ? `confidence=${confidence}` : "",
    note,
  ].filter(Boolean);

  outRows.push([
    `${slug}_univ_001`,
    slug,
    "",
    "",
    orgUnitId,
    "university",
    `${schoolName} 장학공지`,
    listUrl,
    originOf(listUrl),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    DEFAULT_KEYWORDS,
    "",
    "true",
    notesParts.join(" | "),
  ]);
}

const lines = [
  HEADER.join(","),
  ...outRows.map((r) => r.map(toCsvCell).join(",")),
];

const resolvedOut = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
fs.writeFileSync(resolvedOut, `\uFEFF${lines.join("\n")}`, "utf8");

console.log(
  JSON.stringify(
    {
      input: path.resolve(inputPath),
      output: resolvedOut,
      withUrl: outRows.length,
      skippedEmpty,
    },
    null,
    2
  )
);
