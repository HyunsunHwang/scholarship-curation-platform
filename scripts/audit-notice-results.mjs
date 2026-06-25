import fs from "node:fs";
import path from "node:path";

const inputPath =
  process.argv[2] ?? "exports/notices/scholarship-notices-new-20260527.csv";
const cleanedPath = process.argv[3] ?? "";
const rejectedPath = process.argv[4] ?? "";

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

const raw = fs.readFileSync(path.resolve(inputPath), "utf8").replace(/^\uFEFF/, "");
const [header, ...body] = parseCsv(raw);
const index = Object.fromEntries(header.map((name, i) => [name, i]));

const rows = body.map((line) => ({
  sourceId: cleanText(line[index.source_id]),
  sourceName: cleanText(line[index.source_name]),
  title: cleanText(line[index.title]),
  noticeUrl: cleanText(line[index.notice_url]),
  parsedDate: cleanText(line[index.parsed_date]),
}));

const buckets = {
  menuLikeTitle: [],
  oddEnglishTitle: [],
  veryShortTitle: [],
  noDetailPatternUrl: [],
  insecureHttpUrl: [],
};

for (const row of rows) {
  if (
    /(장학(금)?\s*(안내|지원|제도|FAQ)?$)|(장학게시판$)|(장학안내$)|(Scholarship\s*\/?\s*Job)/i.test(
      row.title,
    )
  ) {
    buckets.menuLikeTitle.push(row);
  }
  if (row.title.replace(/\s+/g, "").length <= 6) {
    buckets.veryShortTitle.push(row);
  }
  if (/ScholarshipScholarship|Scholarship \/ JobScholarship \/ Job/i.test(row.title)) {
    buckets.oddEnglishTitle.push(row);
  }
  if (!/mode=view|articleNo=|artclView\.do|uid=\d+|mod=document/i.test(row.noticeUrl)) {
    buckets.noDetailPatternUrl.push(row);
  }
  if (/^http:\/\//i.test(row.noticeUrl)) {
    buckets.insecureHttpUrl.push(row);
  }
}

const sample = (list, limit = 8) =>
  list.slice(0, limit).map((item) => ({
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    title: item.title,
    noticeUrl: item.noticeUrl,
  }));

const report = {
  input: path.resolve(inputPath),
  totalRows: rows.length,
  cleanedRows: cleanedPath && fs.existsSync(path.resolve(cleanedPath))
    ? Math.max(0, parseCsv(fs.readFileSync(path.resolve(cleanedPath), "utf8").replace(/^\uFEFF/, "")).length - 1)
    : null,
  rejectedRows: rejectedPath && fs.existsSync(path.resolve(rejectedPath))
    ? Math.max(0, parseCsv(fs.readFileSync(path.resolve(rejectedPath), "utf8").replace(/^\uFEFF/, "")).length - 1)
    : null,
  counts: Object.fromEntries(Object.entries(buckets).map(([key, list]) => [key, list.length])),
  samples: {
    menuLikeTitle: sample(buckets.menuLikeTitle),
    oddEnglishTitle: sample(buckets.oddEnglishTitle),
    veryShortTitle: sample(buckets.veryShortTitle),
    noDetailPatternUrl: sample(buckets.noDetailPatternUrl),
    insecureHttpUrl: sample(buckets.insecureHttpUrl),
  },
};

console.log(JSON.stringify(report, null, 2));
