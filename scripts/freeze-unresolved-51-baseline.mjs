/**
 * Freeze unresolved-51 baseline from 1st remediation merged results.
 * Baseline = sources where final_status !== "success" (exactly 51).
 *
 * Usage: node scripts/freeze-unresolved-51-baseline.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

function cell(v) {
  const t = String(v ?? "");
  const e = t.replace(/"/g, '""');
  return /[",\n\r]/.test(e) ? `"${e}"` : e;
}

const OUT = "reports/university-beta";
const remPath = path.join(OUT, "four-year-university-remediation.json");
const sourceCsvPath = "data/notice-sources-four-year-univ.csv";

if (!fs.existsSync(remPath)) {
  throw new Error(`Missing ${remPath} — need 1st remediation merge result`);
}

const rem = JSON.parse(fs.readFileSync(remPath, "utf8"));
const all = rem.sources;
if (!Array.isArray(all) || all.length !== 188) {
  throw new Error(`Expected 188 sources in remediation json, got ${all?.length}`);
}

const unresolved = all.filter((s) => s.final_status !== "success");
const ids = unresolved.map((s) => s.source_id);
const unique = new Set(ids);
const originalIds = new Set(all.map((s) => s.source_id));
const missingFrom188 = ids.filter((id) => !originalIds.has(id));

const check = {
  unresolved_source_count: unresolved.length,
  unique_source_id_count: unique.size,
  duplicate_source_id_count: ids.length - unique.size,
  missing_from_original_188: missingFrom188.length,
  original_188: all.length,
};

if (
  check.unresolved_source_count !== 51 ||
  check.unique_source_id_count !== 51 ||
  check.duplicate_source_id_count !== 0 ||
  check.missing_from_original_188 !== 0
) {
  throw new Error(`Baseline validation failed: ${JSON.stringify(check)}`);
}

const sourceTable = parseCsv(
  fs.readFileSync(sourceCsvPath, "utf8").replace(/^\uFEFF/, "")
);
const [sh, ...srows] = sourceTable;
const si = Object.fromEntries(sh.map((h, i) => [h, i]));
const byCsv = new Map(srows.map((r) => [r[si.source_id], r]));

const baseline = unresolved.map((s) => {
  const csv = byCsv.get(s.source_id);
  return {
    source_id: s.source_id,
    source_name: s.source_name,
    university_name: String(s.source_name || "").replace(/\s*장학공지\s*$/, "").trim(),
    list_url: s.list_url || csv?.[si.list_url] || "",
    base_url: csv?.[si.base_url] || "",
    org_unit_id: csv?.[si.org_unit_id] || "",
    university_slug: csv?.[si.university_slug] || "",
    initial_error_bucket: s.initial_error_bucket,
    latest_error_bucket: s.final_error_bucket,
    observed_count: s.final_observed_count,
    matched_count: s.final_matched_count,
    runtime_status: s.final_status,
    existing_parser_strategy: csv?.[si.adapter] || "generic_html",
    existing_notice_url_pattern: csv?.[si.notice_url_pattern] || "",
    existing_list_item_selector: csv?.[si.list_item_selector] || "",
    existing_link_selector: csv?.[si.link_selector] || "",
    notes: csv?.[si.notes] || "",
    prior_root_cause_category: s.root_cause_category || "",
  };
});

fs.mkdirSync(OUT, { recursive: true });

const cols = Object.keys(baseline[0]);
fs.writeFileSync(
  path.join(OUT, "unresolved-51-baseline.csv"),
  `\uFEFF${[cols.join(","), ...baseline.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n")}\n`,
  "utf8"
);

const filteredBody = srows.filter((r) => unique.has(r[si.source_id]));
fs.writeFileSync(
  path.join(OUT, "notice-sources-unresolved-51.csv"),
  `\uFEFF${[sh, ...filteredBody].map((r) => r.map(cell).join(",")).join("\n")}\n`,
  "utf8"
);

const payload = {
  created_at: new Date().toISOString(),
  start_commit_hint: "from remediation/four-year-univ-crawler-90 merge result",
  source_csv: sourceCsvPath,
  source_csv_sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(sourceCsvPath))
    .digest("hex"),
  remediation_json: remPath,
  check,
  sources: baseline,
};

fs.writeFileSync(
  path.join(OUT, "unresolved-51-baseline.json"),
  JSON.stringify(payload, null, 2),
  "utf8"
);

console.log(JSON.stringify({ check, written: baseline.length }, null, 2));
