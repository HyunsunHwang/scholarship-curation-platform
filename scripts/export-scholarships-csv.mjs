import fs from "node:fs";
import path from "node:path";

const inputPath =
  process.argv[2] ??
  "C:/Users/user/.cursor/projects/c-Users-user-Downloads-cursor-projects-1/agent-tools/73c3dfe0-10dc-4c05-89d5-99f26e8a6a47.txt";
const outputPath =
  process.argv[3] ?? "exports/scholarships-current.csv";

const raw = fs.readFileSync(inputPath, "utf8");
const parsedToolOutput = JSON.parse(raw);
const resultText =
  typeof parsedToolOutput.result === "string" ? parsedToolOutput.result : "";
const match = resultText.match(
  /\n<untrusted-data-[^>]+>\n([\s\S]*?)\n<\/untrusted-data-[^>]+>/,
);

if (!match) {
  throw new Error("Failed to locate SQL payload in tool output.");
}

const rows = JSON.parse(match[1]);
if (!Array.isArray(rows)) {
  throw new Error("SQL payload is not an array.");
}

const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

const escapeCsv = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  let stringValue;
  if (Array.isArray(value) || typeof value === "object") {
    stringValue = JSON.stringify(value);
  } else {
    stringValue = String(value);
  }

  const escaped = stringValue.replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

const lines = [headers.join(",")];
for (const row of rows) {
  lines.push(headers.map((header) => escapeCsv(row[header])).join(","));
}

const resolvedOutputPath = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, `\uFEFF${lines.join("\r\n")}`, "utf8");

console.log(`rows=${rows.length}`);
console.log(`output=${resolvedOutputPath}`);
