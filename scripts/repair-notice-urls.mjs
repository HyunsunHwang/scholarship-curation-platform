import fs from "node:fs";
import path from "node:path";

const inputCsvPath =
  process.argv[2] ?? "exports/notices/scholarship-notices-new-20260529.csv";
const sourceCsvPath = process.argv[3] ?? "data/notice-sources.csv";
const outputCsvPath =
  process.argv[4] ?? "exports/notices/scholarship-notices-new-20260529.fixed.csv";

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

function toCsvCell(value) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function loadSourcePathById(csvPath) {
  const raw = fs.readFileSync(path.resolve(csvPath), "utf8").replace(/^\uFEFF/, "");
  const [header, ...body] = parseCsv(raw);
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const map = new Map();

  for (const row of body) {
    const sourceId = cleanText(row[index.source_id]);
    const listUrl = cleanText(row[index.list_url]);
    if (!sourceId || !listUrl) continue;
    try {
      const parsed = new URL(listUrl);
      map.set(sourceId, parsed.pathname || "/");
    } catch {
      // ignore invalid source URL
    }
  }

  return map;
}

function repairUrl(rawUrl, sourcePathname) {
  const input = cleanText(rawUrl);
  if (!input) return input;

  try {
    const url = new URL(input);

    // normalize insecure scheme first
    if (url.protocol === "http:") {
      url.protocol = "https:";
    }

    const hasDetailParams =
      url.searchParams.has("mode") ||
      url.searchParams.has("articleNo") ||
      url.searchParams.has("uid");

    // bug pattern: https://host/?mode=view&articleNo=...
    if (hasDetailParams && (url.pathname === "/" || url.pathname === "") && sourcePathname) {
      url.pathname = sourcePathname;
    }

    return url.toString();
  } catch {
    return input;
  }
}

const sourcePathById = loadSourcePathById(sourceCsvPath);
const inputRaw = fs.readFileSync(path.resolve(inputCsvPath), "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(inputRaw);
if (table.length === 0) {
  throw new Error("Input CSV is empty.");
}

const [header, ...body] = table;
const index = Object.fromEntries(header.map((name, i) => [name, i]));
if (!("source_id" in index) || !("notice_url" in index)) {
  throw new Error("Input CSV must include source_id and notice_url columns.");
}

let repairedCount = 0;
const outputRows = body.map((row) => {
  const sourceId = cleanText(row[index.source_id]);
  const originalUrl = cleanText(row[index.notice_url]);
  const sourcePath = sourcePathById.get(sourceId) ?? "/";
  const repairedUrl = repairUrl(originalUrl, sourcePath);
  if (repairedUrl !== originalUrl) repairedCount += 1;

  const next = [...row];
  next[index.notice_url] = repairedUrl;
  return next;
});

const lines = [
  header.map(toCsvCell).join(","),
  ...outputRows.map((row) => row.map(toCsvCell).join(",")),
];

const resolvedOutput = path.resolve(outputCsvPath);
fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, `\uFEFF${lines.join("\r\n")}`, "utf8");

console.log(`input=${path.resolve(inputCsvPath)}`);
console.log(`output=${resolvedOutput}`);
console.log(`rows=${body.length}`);
console.log(`repaired=${repairedCount}`);
