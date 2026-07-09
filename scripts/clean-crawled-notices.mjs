import fs from "node:fs";
import path from "node:path";

const inputPath =
  process.argv[2] ?? "exports/notices/scholarship-notices-new-20260527.csv";
const cleanedPath =
  process.argv[3] ?? "exports/notices/scholarship-notices-new-20260527.cleaned.csv";
const rejectedPath =
  process.argv[4] ?? "exports/notices/scholarship-notices-new-20260527.rejected.csv";

const MENU_TITLE_PATTERN =
  /^(장학|장학금|scholarship)(\s*[\/|·\-]?\s*(장학|장학금|scholarship))+$|^(장학|장학금|scholarship)$|(^|\s)(장학(금)?\s*(안내|지원|제도|FAQ)?|장학게시판|장학안내|장학공지|장학지원)\s*$|Scholarship\s*\/?\s*Job|ScholarshipScholarship/i;
const GENERIC_NAV_TITLE_PATTERN =
  /^(home|main|메인|홈|사이트맵|sitemap|login|로그인|학과소개|about|contact|교수진|연혁|동창회|학부|학부소개|교과과정|학사정보|이화여자대학교|한양대학교|중앙대학교|고려대학교|연세대학교|성균관대학교|경희대학교|홍익대학교|서울시립대(학교)?|ewha womans university|hanyang university)$/i;
const TITLE_KEYWORD_PATTERN =
  /장학|장학금|학자금|등록금|scholarship|tuition|fellowship|financial\s*aid/i;
const DETAIL_HINT_PATTERN =
  /mode=view|act=view|articleNo=|boardNo=|nttNo=|idx=\d+|no=\d+|wr_id=\d+|b_idx=\d+|seq=\d+|artclView\.do|uid=\d+|mod=document|notice-view\?id=|\/\d{4,}(?:[/?#]|$)/i;

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
  if (/[",\r\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isLikelyListOrMenuUrl(value) {
  try {
    const u = new URL(value);
    const pathName = u.pathname.toLowerCase();
    const search = u.search.toLowerCase();
    const hasDetailHint = DETAIL_HINT_PATTERN.test(`${pathName}${search}`);
    if (hasDetailHint) return false;

    if (pathName === "/" || pathName === "") return true;
    if (/\/(index|main|home|sitemap)(\.(html?|php|jsp|asp|aspx|do))?$/i.test(pathName)) {
      return true;
    }
    if (/\/(sitemap|login|member)(\/|$)/i.test(pathName)) return true;
    if (/indexsub\.action$/i.test(pathName)) return true;

    const listPathPattern =
      /\/(notice|notices|board|boards|list|lists|community|news|scholarship|scholarships)(?:\/|\.do|\.php|\.asp|\.jsp|\.html?)?$/i;
    if (!listPathPattern.test(pathName)) return false;

    const queryString = u.searchParams.toString();
    if (!queryString) return true;

    const listOnlyKeys = ["page", "offset", "limit", "category", "keyfield", "key", "kind", "menuid", "type"];
    const keys = [...u.searchParams.keys()].map((key) => key.toLowerCase());
    return keys.every((key) => listOnlyKeys.includes(key));
  } catch {
    return false;
  }
}

function classify(row) {
  const title = cleanText(row.title);
  const noticeUrl = cleanText(row.noticeUrl);

  if (!title) return "empty_title";
  if (!noticeUrl) return "empty_url";
  if (!/^https?:\/\//i.test(noticeUrl)) return "invalid_url";
  if (/^http:\/\//i.test(noticeUrl)) return "insecure_http_url";
  if (title.replace(/\s+/g, "").length <= 6) return "too_short_title";
  if (GENERIC_NAV_TITLE_PATTERN.test(title)) return "generic_nav_title";
  if (MENU_TITLE_PATTERN.test(title)) return "menu_like_title";
  if (!TITLE_KEYWORD_PATTERN.test(title)) return "title_missing_keyword";
  if (isLikelyListOrMenuUrl(noticeUrl)) return "not_detail_notice_url";
  return null;
}

const raw = fs.readFileSync(path.resolve(inputPath), "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(raw);

if (table.length === 0) {
  throw new Error("Input CSV is empty.");
}

const [header, ...body] = table;
const index = Object.fromEntries(header.map((name, i) => [name, i]));
const requiredColumns = ["title", "notice_url"];
for (const column of requiredColumns) {
  if (!(column in index)) {
    throw new Error(`Missing required column: ${column}`);
  }
}

const seen = new Set();
const cleanedRows = [];
const rejectedRows = [];
const reasonCounts = {};

for (const cells of body) {
  if (cells.length === 0 || cells.every((cell) => cleanText(cell) === "")) continue;

  const row = {
    runAt: cells[index.run_at] ?? "",
    sourceId: cells[index.source_id] ?? "",
    universitySlug: "university_slug" in index ? cells[index.university_slug] ?? "" : "",
    universityId: "university_id" in index ? cells[index.university_id] ?? "" : "",
    collegeId: "college_id" in index ? cells[index.college_id] ?? "" : "",
    departmentId: "department_id" in index ? cells[index.department_id] ?? "" : "",
    collegeName: "college_name" in index ? cells[index.college_name] ?? "" : "",
    departmentName: "department_name" in index ? cells[index.department_name] ?? "" : "",
    sourceLevel: "source_level" in index ? cells[index.source_level] ?? "" : "",
    sourceName: cells[index.source_name] ?? "",
    title: cells[index.title] ?? "",
    noticeUrl: cells[index.notice_url] ?? "",
    dateText: cells[index.date_text] ?? "",
    detailDate: cells[index.detail_date] ?? "",
    parsedDate: cells[index.parsed_date] ?? "",
    content: "content" in index ? cells[index.content] ?? "" : "",
    imageUrls: "image_urls" in index ? cells[index.image_urls] ?? "" : "",
  };

  const reason = classify(row);
  if (reason) {
    rejectedRows.push({ ...row, reason });
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    continue;
  }

  const dedupeKey = `${cleanText(row.sourceId)}|${cleanText(row.noticeUrl)}`;
  if (seen.has(dedupeKey)) {
    rejectedRows.push({ ...row, reason: "duplicate_notice" });
    reasonCounts.duplicate_notice = (reasonCounts.duplicate_notice ?? 0) + 1;
    continue;
  }
  seen.add(dedupeKey);
  cleanedRows.push(row);
}

const outputHeader = [
  "run_at",
  "source_id",
  "university_slug",
  "university_id",
  "college_id",
  "department_id",
  "college_name",
  "department_name",
  "source_level",
  "source_name",
  "title",
  "notice_url",
  "date_text",
  "detail_date",
  "parsed_date",
  "content",
  "image_urls",
];

const cleanedLines = [
  outputHeader.join(","),
  ...cleanedRows.map((row) =>
    [
      row.runAt,
      row.sourceId,
      row.universitySlug,
      row.universityId,
      row.collegeId,
      row.departmentId,
      row.collegeName,
      row.departmentName,
      row.sourceLevel,
      row.sourceName,
      row.title,
      row.noticeUrl,
      row.dateText,
      row.detailDate,
      row.parsedDate,
      row.content,
      row.imageUrls,
    ]
      .map(toCsvCell)
      .join(","),
  ),
];

const rejectedLines = [
  [...outputHeader, "reject_reason"].join(","),
  ...rejectedRows.map((row) =>
    [
      row.runAt,
      row.sourceId,
      row.universitySlug,
      row.universityId,
      row.collegeId,
      row.departmentId,
      row.collegeName,
      row.departmentName,
      row.sourceLevel,
      row.sourceName,
      row.title,
      row.noticeUrl,
      row.dateText,
      row.detailDate,
      row.parsedDate,
      row.content,
      row.imageUrls,
      row.reason,
    ]
      .map(toCsvCell)
      .join(","),
  ),
];

const resolvedCleanedPath = path.resolve(cleanedPath);
const resolvedRejectedPath = path.resolve(rejectedPath);
fs.mkdirSync(path.dirname(resolvedCleanedPath), { recursive: true });
fs.mkdirSync(path.dirname(resolvedRejectedPath), { recursive: true });
fs.writeFileSync(resolvedCleanedPath, `\uFEFF${cleanedLines.join("\r\n")}`, "utf8");
fs.writeFileSync(resolvedRejectedPath, `\uFEFF${rejectedLines.join("\r\n")}`, "utf8");

console.log(`input=${path.resolve(inputPath)}`);
console.log(`total=${body.length}`);
console.log(`cleaned=${cleanedRows.length}`);
console.log(`rejected=${rejectedRows.length}`);
console.log(`cleaned_output=${resolvedCleanedPath}`);
console.log(`rejected_output=${resolvedRejectedPath}`);
console.log(`reject_reasons=${JSON.stringify(reasonCounts)}`);
