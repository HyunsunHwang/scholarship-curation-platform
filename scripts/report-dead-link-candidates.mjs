import fs from "node:fs";
import path from "node:path";

const sourceCsvPath = process.argv[2];
const crawlReportPath = process.argv[3];
const outputPath = process.argv[4] ?? "exports/notices/quality/dead-link-candidates.json";
const timeoutMs = Number(process.env.LINK_CHECK_TIMEOUT_MS ?? 20_000);
const retryCount = Number(process.env.LINK_CHECK_RETRY_COUNT ?? 1);

if (!sourceCsvPath || !crawlReportPath) {
  throw new Error(
    "Usage: node scripts/report-dead-link-candidates.mjs <source-csv> <crawl-report-json> [output-json]",
  );
}

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

function cleanText(value) {
  return String(value ?? "").trim();
}

function loadSourceMap(csvPath) {
  const raw = fs.readFileSync(path.resolve(csvPath), "utf8").replace(/^\uFEFF/, "");
  const [header, ...body] = parseCsv(raw);
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const map = new Map();
  for (const row of body) {
    const sourceId = cleanText(row[index.source_id]);
    if (!sourceId) continue;
    map.set(sourceId, {
      sourceId,
      sourceName: cleanText(row[index.source_name]),
      listUrl: cleanText(row[index.list_url]),
      enabled: cleanText(row[index.enabled] ?? "true"),
    });
  }
  return map;
}

async function checkUrl(url) {
  if (!url) return { status: null, finalUrl: "", category: "missing_url", note: "no list_url" };
  let lastError = null;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; LinkHealthChecker/1.0)" },
      });
      const status = response.status;
      const finalUrl = response.url ?? url;
      clearTimeout(timer);

      if ([404, 410, 451].includes(status)) {
        return { status, finalUrl, category: "dead_link_candidate", note: "hard_http_not_found" };
      }
      if ([403, 429].includes(status)) {
        return { status, finalUrl, category: "blocked_or_rate_limited", note: "http_blocked" };
      }
      if (status >= 500) {
        return { status, finalUrl, category: "server_error", note: "http_5xx" };
      }
      if (status >= 200 && status < 400) {
        return { status, finalUrl, category: "reachable", note: "ok" };
      }
      return { status, finalUrl, category: "other_http", note: `http_${status}` };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retryCount) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
    }
  }

  const msg = String(lastError?.message ?? lastError ?? "fetch_failed");
  if (/aborted|timeout/i.test(msg)) {
    return { status: null, finalUrl: "", category: "timeout_or_network", note: msg };
  }
  if (/ENOTFOUND|DNS/i.test(msg)) {
    return { status: null, finalUrl: "", category: "dead_link_candidate", note: msg };
  }
  return { status: null, finalUrl: "", category: "timeout_or_network", note: msg };
}

async function run() {
  const sources = loadSourceMap(sourceCsvPath);
  const report = JSON.parse(fs.readFileSync(path.resolve(crawlReportPath), "utf8"));
  const failedSources = (report.perSource ?? []).filter((item) => cleanText(item.error));

  const results = [];
  for (const failed of failedSources) {
    const sourceInfo = sources.get(failed.sourceId) ?? {
      sourceId: failed.sourceId,
      sourceName: failed.sourceName,
      listUrl: "",
      enabled: "unknown",
    };
    const health = await checkUrl(sourceInfo.listUrl);
    results.push({
      sourceId: failed.sourceId,
      sourceName: sourceInfo.sourceName || failed.sourceName,
      crawlError: failed.error,
      listUrl: sourceInfo.listUrl,
      enabled: sourceInfo.enabled,
      ...health,
    });
  }

  const byCategory = results.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceCsv: path.resolve(sourceCsvPath),
    crawlReport: path.resolve(crawlReportPath),
    totalFailedSources: failedSources.length,
    categoryCounts: byCategory,
    deadLinkCandidates: results.filter((item) => item.category === "dead_link_candidate"),
    blockedCandidates: results.filter((item) => item.category === "blocked_or_rate_limited"),
    timeoutCandidates: results.filter((item) => item.category === "timeout_or_network"),
    allResults: results,
  };

  const resolvedOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`dead_link_report=${resolvedOutputPath}`);
  console.log(`failed_sources=${failedSources.length}`);
  console.log(`category_counts=${JSON.stringify(byCategory)}`);
  console.log(`dead_candidates=${payload.deadLinkCandidates.length}`);
}

run().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
