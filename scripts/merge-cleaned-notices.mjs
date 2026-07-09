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

function deriveUniversitySlug(sourceId, fallback = "") {
  const normalizedSourceId = cleanText(sourceId).toLowerCase();
  if (normalizedSourceId.includes("_")) return normalizedSourceId.split("_")[0];
  return cleanText(fallback).toLowerCase();
}

function deriveDepartmentName(sourceName, sourceLevel = "department", fallback = "") {
  if (cleanText(sourceLevel).toLowerCase() !== "department") {
    return cleanText(fallback);
  }
  const normalizedFallback = cleanText(fallback);
  if (normalizedFallback) return normalizedFallback;

  const normalizedSourceName = cleanText(sourceName);
  if (!normalizedSourceName) return "";
  const pieces = normalizedSourceName.split(/\s+/);
  if (pieces.length <= 1) return normalizedSourceName;
  return pieces.slice(1).join(" ").trim();
}

function toSourcePriority(sourceLevel) {
  const normalized = cleanText(sourceLevel).toLowerCase();
  if (normalized === "university") return 3;
  if (normalized === "college") return 2;
  if (normalized === "department") return 1;
  return 0;
}

function parseInputPaths(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function deriveGroupName(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/cau/")) return "cau";
  if (normalized.includes("/ewha/")) return "ewha";
  if (normalized.includes("/hongik/")) return "hongik";
  if (normalized.includes("/hanyang/")) return "hanyang";
  if (normalized.includes("/khu/")) return "khu";
  if (normalized.includes("/korea/")) return "korea";
  if (normalized.includes("/skku/")) return "skku";
  if (normalized.includes("/uos/")) return "uos";
  if (normalized.includes("/yonsei/")) return "yonsei";
  return "unknown";
}

function deriveScholarshipType(group) {
  if (group === "unknown") return "off_campus";
  return "on_campus";
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
  const scholarshipType = deriveScholarshipType(group);
  return body
    .map((row) => ({
      source_group: group,
      scholarship_type: scholarshipType,
      source_id: cleanText(row[index.source_id]),
      university_slug: deriveUniversitySlug(row[index.source_id], row[index.university_slug]),
      university_id: cleanText(row[index.university_id]),
      college_id: cleanText(row[index.college_id]),
      department_id: cleanText(row[index.department_id]),
      college_name: cleanText(row[index.college_name]),
      source_level: cleanText(row[index.source_level]) || "department",
      department_name: deriveDepartmentName(
        row[index.source_name],
        cleanText(row[index.source_level]) || "department",
        row[index.department_name],
      ),
      source_name: cleanText(row[index.source_name]),
      title: cleanText(row[index.title]),
      notice_url: cleanText(row[index.notice_url]),
      date_text: cleanText(row[index.date_text]),
      detail_date: cleanText(row[index.detail_date]),
      parsed_date: cleanText(row[index.parsed_date]),
      content: "content" in index ? cleanText(row[index.content]) : "",
      image_urls: "image_urls" in index ? cleanText(row[index.image_urls]) : "",
      notice_posted_at: "",
      run_at: cleanText(row[index.run_at] || runAt),
    }))
    .map((row) => ({
      ...row,
      source_priority: toSourcePriority(row.source_level),
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
  "scholarship_type",
  "source_id",
  "university_slug",
  "university_id",
  "college_id",
  "department_id",
  "college_name",
  "department_name",
  "source_level",
  "source_priority",
  "source_name",
  "title",
  "notice_url",
  "notice_posted_at",
  "date_text",
  "detail_date",
  "parsed_date",
  "content",
  "image_urls",
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
