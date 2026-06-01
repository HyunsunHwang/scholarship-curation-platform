import fs from "node:fs";
import path from "node:path";

const inputPath =
  process.argv[2] ??
  String.raw`C:\Users\user\Downloads\성균관대_보완.csv`;
const outputPath = process.argv[3] ?? "data/notice-sources-skku.csv";

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

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(rawValue) {
  const raw = cleanText(rawValue);
  if (!raw) return "";
  const markdownMatch = raw.match(/\((https?:\/\/[^)]+)\)/i);
  let candidate = markdownMatch?.[1] ?? raw;
  if (candidate.startsWith("ttps://")) candidate = `h${candidate}`;
  if (!/^https?:\/\//i.test(candidate)) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return "";
  }
}

function toCsvCell(value) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

const raw = fs.readFileSync(path.resolve(inputPath), "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(raw);
if (table.length === 0) throw new Error("Input CSV is empty.");

const [header, ...body] = table;
const index = Object.fromEntries(header.map((name, i) => [name, i]));
const requiredColumns = ["단과대", "학과", "공지사항 링크"];
for (const column of requiredColumns) {
  if (!(column in index)) throw new Error(`Missing required column: ${column}`);
}

const rows = [];
const seen = new Set();
for (const source of body) {
  const college = cleanText(source[index["단과대"]]);
  const department = cleanText(source[index["학과"]]);
  const listUrl = normalizeUrl(source[index["공지사항 링크"]]);
  if (!college || !department || !listUrl) continue;

  const key = `${department}|${listUrl}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const origin = new URL(listUrl).origin;
  rows.push({
    source_id: `skku_${String(rows.length + 1).padStart(3, "0")}`,
    source_name: `성균관대 ${department}`,
    list_url: listUrl,
    base_url: origin,
    list_item_selector: "",
    link_selector: "",
    title_selector: "",
    date_selector: "",
    detail_content_selector: "",
    detail_date_selector: "",
    notice_url_pattern: "",
    keywords: "",
    enabled: "true",
  });
}

const outputHeader = [
  "source_id",
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
  "enabled",
];

const lines = [outputHeader.join(",")];
for (const row of rows) {
  lines.push(outputHeader.map((column) => toCsvCell(row[column])).join(","));
}

const resolvedOutput = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, `\uFEFF${lines.join("\r\n")}`, "utf8");

console.log(`rows=${rows.length}`);
console.log(`output=${resolvedOutput}`);
