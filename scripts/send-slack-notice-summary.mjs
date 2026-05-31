import fs from "node:fs";
import path from "node:path";

const webhookUrl = process.env.SLACK_WEBHOOK_URL;
const cleanedCsvPath =
  process.env.CLEANED_CSV_PATH ?? "exports/notices/scholarship-notices-latest.cleaned.csv";
const reportJsonPath =
  process.env.REPORT_JSON_PATH ?? "exports/notices/scholarship-notices-latest.json";
const cleanedCsvPathsEnv = process.env.CLEANED_CSV_PATHS ?? "";
const reportJsonPathsEnv = process.env.REPORT_JSON_PATHS ?? "";
const sourceLabelsEnv = process.env.SOURCE_LABELS ?? "";
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

function parsePathList(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => cleanText(part))
    .filter(Boolean);
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

function buildSingleMessage(report, cleanedRows) {
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

function buildMultiMessage(datasets) {
  const totalSourceCount = datasets.reduce((sum, item) => sum + (item.report?.totals?.sourceCount ?? 0), 0);
  const totalMatchedCount = datasets.reduce((sum, item) => sum + (item.report?.totals?.matchedCount ?? 0), 0);
  const totalNewCount = datasets.reduce((sum, item) => sum + (item.report?.totals?.newCount ?? 0), 0);
  const totalCleanedCount = datasets.reduce((sum, item) => sum + item.cleanedRows.length, 0);

  const lines = [
    "*장학금 크롤링 결과 (통합)*",
    `- 대상 그룹: ${datasets.length}개`,
    `- 전체 소스: ${totalSourceCount}개`,
    `- 전체 매칭: ${totalMatchedCount}건`,
    `- 전체 신규(new): ${totalNewCount}건`,
    `- 전체 정제(cleaned): ${totalCleanedCount}건`,
  ];

  for (const dataset of datasets) {
    const label = dataset.label;
    const totals = dataset.report?.totals ?? {};
    const sourceCount = totals.sourceCount ?? "-";
    const matchedCount = totals.matchedCount ?? "-";
    const newCount = totals.newCount ?? "-";
    const cleanedCount = dataset.cleanedRows.length;
    const preview = dataset.cleanedRows.slice(0, maxPreviewCount);

    lines.push("");
    lines.push(`*${label}*`);
    lines.push(`- 소스 ${sourceCount} | 매칭 ${matchedCount} | 신규 ${newCount} | 정제 ${cleanedCount}`);

    if (preview.length === 0) {
      lines.push("- 신규 장학금 없음");
      continue;
    }

    preview.forEach((row, idx) => {
      lines.push(`${idx + 1}. [${row.sourceName}] ${row.title}`);
      lines.push(`${row.noticeUrl}`);
    });
  }

  return lines.join("\\n");
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
  const reportJsonPaths = parsePathList(reportJsonPathsEnv);
  const cleanedCsvPaths = parsePathList(cleanedCsvPathsEnv);
  const sourceLabels = parsePathList(sourceLabelsEnv);

  let text;
  if (reportJsonPaths.length > 0 && cleanedCsvPaths.length > 0) {
    const size = Math.min(reportJsonPaths.length, cleanedCsvPaths.length);
    const datasets = [];
    for (let i = 0; i < size; i += 1) {
      datasets.push({
        label: sourceLabels[i] ?? `그룹 ${i + 1}`,
        report: safeReadJson(reportJsonPaths[i], {}),
        cleanedRows: readCleanedRows(cleanedCsvPaths[i]),
      });
    }
    text = buildMultiMessage(datasets);
  } else {
    const report = safeReadJson(reportJsonPath, {});
    const cleanedRows = readCleanedRows(cleanedCsvPath);
    text = buildSingleMessage(report, cleanedRows);
  }

  await sendSlack(text);
  console.log(`message_length=${text.length}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
