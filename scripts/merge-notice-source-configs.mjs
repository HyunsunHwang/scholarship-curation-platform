import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const OUTPUT_PATH = path.join(root, "data", "notice-sources.csv");
const SOURCES = [
  { file: path.join(root, "data", "notice-sources.csv"), includePrefixes: ["ewha_"] },
  { file: path.join(root, "data", "notice-sources-uos.csv"), includePrefixes: ["uos_"] },
  { file: path.join(root, "data", "notice-sources-cau.csv"), includePrefixes: ["cau_"] },
  { file: path.join(root, "data", "notice-sources-hanyang.csv"), includePrefixes: ["hanyang_"] },
  { file: path.join(root, "data", "notice-sources-hongik.csv"), includePrefixes: ["hongik_"] },
  { file: path.join(root, "data", "notice-sources-khu.csv"), includePrefixes: ["khu_"] },
  { file: path.join(root, "data", "notice-sources-korea.csv"), includePrefixes: ["korea_"] },
  { file: path.join(root, "data", "notice-sources-skku.csv"), includePrefixes: ["skku_"] },
  { file: path.join(root, "data", "notice-sources-yonsei.csv"), includePrefixes: ["yonsei_"] },
];

const HEADER = [
  "source_id",
  "university_slug",
  "university_id",
  "college_id",
  "department_id",
  "org_unit_id",
  "college_name",
  "department_name",
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
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === "\"" && next === "\"") {
        field += "\"";
        i += 1;
      } else if (ch === "\"") {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
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

function escapeCsv(value) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function normalize(value) {
  return String(value ?? "").trim();
}

function deriveUniversitySlug(sourceId, fallback = "") {
  const normalizedId = normalize(sourceId).toLowerCase();
  if (normalizedId.includes("_")) return normalizedId.split("_")[0];
  return normalize(fallback).toLowerCase();
}

function deriveDepartmentName(sourceName, sourceLevel = "department", fallback = "") {
  if (normalize(sourceLevel).toLowerCase() !== "department") {
    return normalize(fallback);
  }
  const normalizedFallback = normalize(fallback);
  if (normalizedFallback) return normalizedFallback;

  const normalizedSourceName = normalize(sourceName);
  if (!normalizedSourceName) return "";
  const pieces = normalizedSourceName.split(/\s+/);
  if (pieces.length <= 1) return normalizedSourceName;
  return pieces.slice(1).join(" ").trim();
}

function readRows(filePath, includePrefixes) {
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) return [];

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  if (index.source_id == null) return [];

  return body
    .filter((cells) => cells.some((cell) => normalize(cell) !== ""))
    .map((cells) => {
      const row = {};
      for (const column of HEADER) {
        row[column] = cells[index[column]] ?? "";
      }
      row.university_slug = deriveUniversitySlug(row.source_id, row.university_slug);
      row.source_level = normalize(row.source_level) || "department";
      row.department_name = deriveDepartmentName(
        row.source_name,
        row.source_level,
        row.department_name,
      );
      return row;
    })
    .filter((row) => includePrefixes.some((prefix) => normalize(row.source_id).startsWith(prefix)));
}

const merged = [];
const seen = new Set();

for (const source of SOURCES) {
  const rows = readRows(source.file, source.includePrefixes);
  for (const row of rows) {
    const sourceId = normalize(row.source_id);
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);
    merged.push(row);
  }
}

merged.sort((a, b) => normalize(a.source_id).localeCompare(normalize(b.source_id), "en"));

const lines = [
  HEADER.join(","),
  ...merged.map((row) => HEADER.map((column) => escapeCsv(row[column])).join(",")),
];
writeFileSync(OUTPUT_PATH, `\uFEFF${lines.join("\r\n")}`, "utf8");

console.log(`rows=${merged.length}`);
console.log(`output=${OUTPUT_PATH}`);
