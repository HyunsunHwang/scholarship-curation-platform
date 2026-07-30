/**
 * Disable duplicate GNTECH source (merged into GNU / 경상국립대 in 2021).
 * Keep ou_1864 as the sole active crawler for the shared GNU scholarship board.
 */
import fs from "node:fs";

const CSV = "data/notice-sources-four-year-univ.csv";

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
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

function esc(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const table = parseCsv(fs.readFileSync(CSV, "utf8").replace(/^\uFEFF/, ""));
const header = table[0];
const index = Object.fromEntries(header.map((h, i) => [h, i]));

const gntech = table.find((r) => r[index.source_id] === "ou_1821_univ_001");
const gnu = table.find((r) => r[index.source_id] === "ou_1864_univ_001");
if (!gntech || !gnu) throw new Error("missing GNTECH/GNU rows");

gntech[index.enabled] = "false";
const note = gntech[index.notes] || "";
if (!/DISABLED_DUPLICATE_GNU/.test(note)) {
  gntech[index.notes] =
    `${note} | DISABLED_DUPLICATE_GNU: 2021년 경상국립대(GNU) 통합; 동일 list_url은 ou_1864_univ_001만 활성`.trim();
}
if (!/CANONICAL_GNU_SCHOLARSHIP_BOARD/.test(gnu[index.notes] || "")) {
  gnu[index.notes] =
    `${gnu[index.notes] || ""} | CANONICAL_GNU_SCHOLARSHIP_BOARD (ou_1821 disabled as duplicate)`.trim();
}

fs.writeFileSync(CSV, `${table.map((r) => r.map(esc).join(",")).join("\n")}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      disabled: "ou_1821_univ_001",
      canonical: "ou_1864_univ_001",
      shared_list_url: gnu[index.list_url],
      gntech_enabled: gntech[index.enabled],
    },
    null,
    2,
  ),
);
