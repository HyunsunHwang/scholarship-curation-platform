/**
 * Build error/zero inventory CSV from four-year crawl report + source CSV.
 *
 * Usage:
 *   npx tsx scripts/build-four-year-error-inventory.ts
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
      } else if (ch === '"') inQuotes = false;
      else field += ch;
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
    } else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

function toCsvCell(value: unknown): string {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

const reportPath =
  process.argv[2] ?? "exports/notices-four-year-univ/scholarship-notices-latest.json";
const sourceCsvPath = process.argv[3] ?? "data/notice-sources-four-year-univ.csv";
const outDir = process.argv[4] ?? "reports/university-beta";

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const csvRaw = fs.readFileSync(sourceCsvPath, "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(csvRaw);
const [header, ...body] = table;
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const byId = new Map(
  body.map((row) => [String(row[idx.source_id]).trim(), row])
);

const perSource = report.perSource as Array<Record<string, unknown>>;

type Row = {
  source_id: string;
  source_name: string;
  list_url: string;
  base_url: string;
  org_unit_id: string;
  university_slug: string;
  notes: string;
  initial_status: string;
  initial_error_bucket: string;
  initial_observed_count: number;
  initial_matched_count: number;
  initial_new_count: number;
  cohort: "error_90" | "success_zero_20" | "success_with_items";
};

const rows: Row[] = [];
for (const s of perSource) {
  const sourceId = String(s.sourceId ?? "");
  const csv = byId.get(sourceId);
  const reason = String(s.reasonCode ?? s.finalStatus ?? "");
  const finalStatus = String(s.finalStatus ?? "");
  const crawled = Number(s.crawledCount ?? 0);
  const matched = Number(s.matchedCount ?? 0);
  const newCount = Number(s.newCount ?? 0);

  let cohort: Row["cohort"] = "success_with_items";
  if (finalStatus !== "success") cohort = "error_90";
  else if (crawled === 0) cohort = "success_zero_20";

  rows.push({
    source_id: sourceId,
    source_name: String(s.sourceName ?? csv?.[idx.source_name] ?? ""),
    list_url: String(csv?.[idx.list_url] ?? ""),
    base_url: String(csv?.[idx.base_url] ?? ""),
    org_unit_id: String(csv?.[idx.org_unit_id] ?? ""),
    university_slug: String(csv?.[idx.university_slug] ?? ""),
    notes: String(csv?.[idx.notes] ?? ""),
    initial_status: finalStatus,
    initial_error_bucket: reason,
    initial_observed_count: crawled,
    initial_matched_count: matched,
    initial_new_count: newCount,
    cohort,
  });
}

fs.mkdirSync(outDir, { recursive: true });

const allCsvPath = path.join(outDir, "four-year-initial-source-inventory.csv");
const errCsvPath = path.join(outDir, "four-year-error-90-sources.csv");
const zeroCsvPath = path.join(outDir, "four-year-success-zero-20-sources.csv");
const filteredSourceCsv = path.join(outDir, "notice-sources-error-and-zero.csv");

const cols = [
  "source_id",
  "source_name",
  "university_name",
  "list_url",
  "base_url",
  "org_unit_id",
  "university_slug",
  "notes",
  "initial_status",
  "initial_error_bucket",
  "initial_observed_count",
  "initial_matched_count",
  "initial_new_count",
  "cohort",
] as const;

function universityName(sourceName: string) {
  return sourceName.replace(/\s*장학공지\s*$/, "").trim();
}

function writeInventory(file: string, subset: Row[]) {
  const lines = [
    cols.join(","),
    ...subset.map((r) =>
      [
        r.source_id,
        r.source_name,
        universityName(r.source_name),
        r.list_url,
        r.base_url,
        r.org_unit_id,
        r.university_slug,
        r.notes,
        r.initial_status,
        r.initial_error_bucket,
        r.initial_observed_count,
        r.initial_matched_count,
        r.initial_new_count,
        r.cohort,
      ]
        .map(toCsvCell)
        .join(",")
    ),
  ];
  fs.writeFileSync(file, `\uFEFF${lines.join("\n")}`, "utf8");
}

const errors = rows.filter((r) => r.cohort === "error_90");
const zeros = rows.filter((r) => r.cohort === "success_zero_20");
const probeTargets = [...errors, ...zeros];

writeInventory(allCsvPath, rows);
writeInventory(errCsvPath, errors);
writeInventory(zeroCsvPath, zeros);

// Filtered notice-sources CSV for diagnose/crawl retries
const sourceHeader = header;
const probeIds = new Set(probeTargets.map((r) => r.source_id));
const filteredBody = body.filter((row) => probeIds.has(String(row[idx.source_id]).trim()));
fs.writeFileSync(
  filteredSourceCsv,
  `\uFEFF${[sourceHeader, ...filteredBody].map((r) => r.map(toCsvCell).join(",")).join("\n")}`,
  "utf8"
);

const bucketCounts: Record<string, number> = {};
for (const r of errors) {
  bucketCounts[r.initial_error_bucket] =
    (bucketCounts[r.initial_error_bucket] ?? 0) + 1;
}

const meta = {
  reportPath,
  sourceCsvPath,
  sourceCsvSha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(sourceCsvPath))
    .digest("hex"),
  total: rows.length,
  error_90: errors.length,
  success_zero_20: zeros.length,
  success_with_items: rows.filter((r) => r.cohort === "success_with_items").length,
  errorBuckets: bucketCounts,
  outputs: {
    allCsvPath,
    errCsvPath,
    zeroCsvPath,
    filteredSourceCsv,
  },
};

fs.writeFileSync(
  path.join(outDir, "four-year-initial-inventory-meta.json"),
  JSON.stringify(meta, null, 2),
  "utf8"
);

console.log(JSON.stringify(meta, null, 2));
