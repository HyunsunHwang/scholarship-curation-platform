import fs from "node:fs";
import path from "node:path";

const inputPathsEnv = process.env.MERGE_INPUT_PATHS ?? "";
const outputPath = process.env.MERGE_OUTPUT_PATH ?? "exports/notices/daily/scholarship-notices-daily-latest.csv";
const runAt = process.env.MERGE_RUN_AT ?? new Date().toISOString();

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

    if (ch === '"') {
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

function toCsvCell(value) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, "\"\"");
  if (/[",\r\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function parseInputPaths(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function deriveGroupName(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/ewha/")) return "ewha";
  if (normalized.includes("/korea/")) return "korea";
  if (normalized.includes("/yonsei/")) return "yonsei";
  return "unknown";
}

function readRows(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return [];

  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) return [];

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const requiredColumns = ["source_id", "source_name", "title", "notice_url"];
  for (const column of requiredColumns) {
    if (!(column in index)) return [];
  }

  const group = deriveGroupName(filePath);
  return body
    .map((row) => ({
      source_group: group,
      source_id: cleanText(row[index.source_id]),
      source_name: cleanText(row[index.source_name]),
      title: cleanText(row[index.title]),
      notice_url: cleanText(row[index.notice_url]),
      date_text: cleanText(row[index.date_text]),
      detail_date: cleanText(row[index.detail_date]),
      parsed_date: cleanText(row[index.parsed_date]),
      notice_posted_at: "",
      run_at: cleanText(row[index.run_at] || runAt),
    }))
    .map((row) => ({
      ...row,
      notice_posted_at: row.parsed_date || row.detail_date || row.date_text || "",
    }))
    .filter((row) => row.title && row.notice_url);
}

const inputPaths = parseInputPaths(inputPathsEnv);
const merged = [];
for (const inputPath of inputPaths) {
  merged.push(...readRows(inputPath));
}

const outputHeader = [
  "source_group",
  "source_id",
  "source_name",
  "title",
  "notice_url",
  "notice_posted_at",
  "date_text",
  "detail_date",
  "parsed_date",
  "run_at",
];

const lines = [
  outputHeader.join(","),
  ...merged.map((row) =>
    outputHeader
      .map((column) => toCsvCell(row[column]))
      .join(","),
  ),
];

const resolvedOutputPath = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, `\uFEFF${lines.join("\r\n")}`, "utf8");

console.log(`inputs=${inputPaths.length}`);
console.log(`rows=${merged.length}`);
console.log(`output=${resolvedOutputPath}`);
