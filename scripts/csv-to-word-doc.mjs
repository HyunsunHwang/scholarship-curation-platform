import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? "exports/scholarships-current.csv";
const outputPath = process.argv[3] ?? "exports/scholarships-current.doc";

const source = fs.readFileSync(path.resolve(inputPath), "utf8");
const csv = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\n", "<br/>");

const rows = parseCsv(csv);
if (rows.length === 0) {
  throw new Error("CSV is empty.");
}

const [header, ...body] = rows;
const colCount = header.length;
const headerHtml = header
  .map((cell) => `<th>${escapeHtml(cell)}</th>`)
  .join("");
const bodyHtml = body
  .map((row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push("");
    return `<tr>${padded
      .slice(0, colCount)
      .map((cell) => `<td>${escapeHtml(cell)}</td>`)
      .join("")}</tr>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>scholarships-current</title>
  <style>
    body { font-family: "Malgun Gothic", Arial, sans-serif; font-size: 10pt; margin: 12px; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: 1px solid #888; padding: 4px; vertical-align: top; word-wrap: break-word; }
    thead th { background: #f2f2f2; font-weight: 700; }
  </style>
</head>
<body>
  <h1>장학금 데이터 추출본</h1>
  <p>원본: ${escapeHtml(path.basename(inputPath))}</p>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>
${bodyHtml}
    </tbody>
  </table>
</body>
</html>
`;

const resolvedOutput = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, `\uFEFF${html}`, "utf8");

console.log(`rows=${body.length}`);
console.log(`output=${resolvedOutput}`);
