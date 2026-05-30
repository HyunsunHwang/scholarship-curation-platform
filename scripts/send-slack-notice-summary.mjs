import fs from "node:fs";
import path from "node:path";

const webhookUrl = process.env.SLACK_WEBHOOK_URL;
const cleanedCsvPath =
  process.env.CLEANED_CSV_PATH ?? "exports/notices/scholarship-notices-latest.cleaned.csv";
const reportJsonPath =
  process.env.REPORT_JSON_PATH ?? "exports/notices/scholarship-notices-latest.json";
const maxPreviewCount = Number(process.env.SLACK_PREVIEW_COUNT ?? 5);

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

function safeReadJson(filePath, fallback = null) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch {
    return fallback;
  }
}

function readCleanedRows(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return [];
  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) return [];

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const required = ["source_name", "title", "notice_url"];
  for (const column of required) {
    if (!(column in index)) return [];
  }

  return body
    .map((row) => ({
      sourceName: cleanText(row[index.source_name]),
      title: cleanText(row[index.title]),
      noticeUrl: cleanText(row[index.notice_url]),
    }))
    .filter((row) => row.title && row.noticeUrl);
}

function buildMessage(report, cleanedRows) {
  const totals = report?.totals ?? {};
  const sourceCount = totals.sourceCount ?? "-";
  const matchedCount = totals.matchedCount ?? "-";
  const newCount = totals.newCount ?? "-";
  const cleanedCount = cleanedRows.length;

  const header =
    `*장학금 크롤링 결과*\\n` +
    `- 소스: ${sourceCount}개\\n` +
    `- 매칭: ${matchedCount}건\\n` +
    `- 신규(new): ${newCount}건\\n` +
    `- 정제(cleaned): ${cleanedCount}건`;

  const preview = cleanedRows.slice(0, maxPreviewCount);
  if (preview.length === 0) {
    return `${header}\\n\\n- 오늘 공유할 신규 장학금이 없습니다.`;
  }

  const body = preview
    .map((row, idx) => `${idx + 1}. [${row.sourceName}] ${row.title}\\n${row.noticeUrl}`)
    .join("\\n\\n");

  return `${header}\\n\\n*상위 ${preview.length}건 미리보기*\\n${body}`;
}

async function sendSlack(text) {
  if (!webhookUrl) {
    console.log("skip=missing_webhook_url");
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook failed: HTTP ${response.status} ${body}`);
  }
}

async function run() {
  const report = safeReadJson(reportJsonPath, {});
  const cleanedRows = readCleanedRows(cleanedCsvPath);
  const text = buildMessage(report, cleanedRows);
  await sendSlack(text);
  console.log(`message_length=${text.length}`);
  console.log(`cleaned_rows=${cleanedRows.length}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
