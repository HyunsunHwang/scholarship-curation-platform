import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? "seed-scholarships.sql";
const outputPath = process.argv[3] ?? "exports/scholarships-current.csv";

const sql = fs.readFileSync(inputPath, "utf8");

function splitTopLevel(input, delimiter = ",") {
  const parts = [];
  let current = "";
  let inSingleQuote = false;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inSingleQuote) {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      current += char;
      continue;
    }
    if (char === "]") {
      bracketDepth -= 1;
      current += char;
      continue;
    }
    if (char === "(") {
      parenDepth += 1;
      current += char;
      continue;
    }
    if (char === ")") {
      parenDepth -= 1;
      current += char;
      continue;
    }

    if (char === delimiter && bracketDepth === 0 && parenDepth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

function parseSqlValue(rawValue) {
  const value = rawValue.trim();
  if (value === "NULL") return "";
  if (value === "true") return "true";
  if (value === "false") return "false";
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;

  if (value.startsWith("ARRAY[")) {
    const closeIdx = value.indexOf("]");
    const inner = closeIdx >= 0 ? value.slice(6, closeIdx) : "";
    const items = splitTopLevel(inner).map((item) => {
      const trimmed = item.trim();
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1).replace(/''/g, "'");
      }
      return trimmed;
    });
    return JSON.stringify(items);
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
}

function escapeCsv(value) {
  const stringValue = value ?? "";
  const escaped = String(stringValue).replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

const insertRegex =
  /INSERT INTO\s+public\.scholarships\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\);/g;

const rows = [];
let match;
while ((match = insertRegex.exec(sql)) !== null) {
  const columnPart = match[1];
  const valuePart = match[2];

  const columns = splitTopLevel(columnPart).map((name) => name.trim());
  const values = splitTopLevel(valuePart);
  const row = {};

  for (let i = 0; i < columns.length; i += 1) {
    row[columns[i]] = parseSqlValue(values[i] ?? "");
  }

  rows.push(row);
}

const allHeaders = Array.from(
  rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set())
);

const csvLines = [allHeaders.join(",")];
for (const row of rows) {
  const line = allHeaders.map((header) => escapeCsv(row[header] ?? "")).join(",");
  csvLines.push(line);
}

const resolvedOutputPath = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, `\uFEFF${csvLines.join("\r\n")}`, "utf8");

console.log(`rows=${rows.length}`);
console.log(`output=${resolvedOutputPath}`);
