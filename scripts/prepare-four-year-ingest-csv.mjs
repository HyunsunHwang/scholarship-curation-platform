/**
 * Add source_group column for ingest compatibility.
 */
import fs from "node:fs";

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

const inputs = [
  "exports/notices-four-year-univ/scholarship-notices-new-20260730.csv",
  "exports/notices-four-year-retry/scholarship-notices-new-20260730.csv",
];

const [h0, ...rows0] = parseCsv(fs.readFileSync(inputs[0], "utf8").replace(/^\uFEFF/, ""));
const [h1, ...rows1] = parseCsv(fs.readFileSync(inputs[1], "utf8").replace(/^\uFEFF/, ""));
const i0 = Object.fromEntries(h0.map((h, i) => [h, i]));
const i1 = Object.fromEntries(h1.map((h, i) => [h, i]));

const seen = new Set();
const merged = [];
for (const [header, rows, idx] of [
  [h0, rows0, i0],
  [h1, rows1, i1],
]) {
  for (const row of rows) {
    const url = row[idx.notice_url];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const slug = row[idx.university_slug] || "unknown";
    const sourceId = row[idx.source_id] || "";
    const group = slug.startsWith("ou_") ? slug : sourceId.split("_").slice(0, 2).join("_") || slug;
    merged.push({
      source_group: group,
      source_id: sourceId,
      university_slug: slug,
      source_name: row[idx.source_name],
      title: row[idx.title],
      notice_url: url,
      date_text: row[idx.date_text],
      detail_date: row[idx.detail_date],
      parsed_date: row[idx.parsed_date],
      content: row[idx.content],
      image_urls: row[idx.image_urls],
      attachment_metadata: row[idx.attachment_metadata],
    });
  }
}

const cols = Object.keys(merged[0]);
const outPath = "exports/notices-four-year-univ/scholarship-notices-merged-for-ingest.csv";
fs.writeFileSync(
  outPath,
  `\uFEFF${[cols.join(","), ...merged.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n")}\n`,
  "utf8"
);
console.log(JSON.stringify({ outPath, rows: merged.length }, null, 2));
