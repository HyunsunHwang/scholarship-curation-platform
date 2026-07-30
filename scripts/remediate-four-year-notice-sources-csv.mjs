/**
 * Apply common remediations to four-year notice-sources CSV.
 *
 * - Expand/clear overly-narrow notice_url_pattern that dropped artclView.do
 * - Clear list_item_selector for diagnose selector_miss rows
 * - Keep keywords / base_url intact
 */
import fs from "node:fs";

const EXPANDED_PATTERN =
  "(mode=view|sMode=VIEW_FORM|iBrdContNo=|articleNo=|boardNo=|nttNo=|nttId=|idx=\\d+|no=\\d+|wr_id=\\d+|boardSeq=\\d+|b_idx=\\d+|seq=\\d+|uid=\\d+|artclNo=|artclView\\.do|notice-view\\?id=|mod=document)";

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
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

function toCsvCell(value) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

const sourcePath = "data/notice-sources-four-year-univ.csv";
const diagPath =
  "exports/notices/diagnostics-four-year-errors/source-diagnostics-20260730.csv";

const table = parseCsv(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
const [header, ...body] = table;
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const diagTable = parseCsv(fs.readFileSync(diagPath, "utf8").replace(/^\uFEFF/, ""));
const [dh, ...drows] = diagTable;
const di = Object.fromEntries(dh.map((h, i) => [h, i]));
const selectorMiss = new Set(
  drows.filter((r) => r[di.bucket] === "selector_miss").map((r) => r[di.source_id])
);

let patternFixed = 0;
let selectorCleared = 0;

for (const row of body) {
  const sid = row[idx.source_id];
  const pattern = (row[idx.notice_url_pattern] || "").trim();
  if (pattern && !/artclView/i.test(pattern)) {
    row[idx.notice_url_pattern] = EXPANDED_PATTERN;
    patternFixed += 1;
  } else if (!pattern) {
    // leave empty — crawler DEFAULT_NOTICE_URL_PATTERN already includes artclView
  }

  if (selectorMiss.has(sid) && (row[idx.list_item_selector] || "").trim()) {
    row[idx.list_item_selector] = "";
    selectorCleared += 1;
  }
}

const out = [header, ...body].map((r) => r.map(toCsvCell).join(",")).join("\n");
fs.writeFileSync(sourcePath, `\uFEFF${out}\n`, "utf8");

// Also refresh error-only CSV for retry crawl
const crawl = JSON.parse(
  fs.readFileSync(
    "exports/notices-four-year-univ/scholarship-notices-latest.json",
    "utf8"
  )
);
const errorIds = new Set(
  crawl.perSource
    .filter((s) => s.finalStatus !== "success" || Number(s.crawledCount) === 0)
    .map((s) => s.sourceId)
);
const filtered = body.filter((r) => errorIds.has(r[idx.source_id]));
fs.mkdirSync("reports/university-beta", { recursive: true });
fs.writeFileSync(
  "reports/university-beta/notice-sources-retry-errors-and-zero.csv",
  `\uFEFF${[header, ...filtered].map((r) => r.map(toCsvCell).join(",")).join("\n")}\n`,
  "utf8"
);

console.log(
  JSON.stringify(
    {
      patternFixed,
      selectorCleared,
      retrySources: filtered.length,
      retryCsv: "reports/university-beta/notice-sources-retry-errors-and-zero.csv",
    },
    null,
    2
  )
);
