import fs from "node:fs";
import path from "node:path";
import { load as loadHtml } from "cheerio";
import { extractNoticeUrlFromLinkNode } from "../lib/crawler-adapters/index.mjs";

/**
 * Read-only 진단 스크립트.
 *
 * 각 소스의 list_url을 실제로 한 번씩 받아 아래 버킷으로 분류합니다.
 *   - ok               : list_item_selector가 목록 행을 잡고 링크 추출까지 성공
 *   - fallback_scan    : list_item_selector 미설정 → 페이지 전체 <a> 스캔 모드(오탐 위험)
 *   - selector_miss    : list_item_selector는 있으나 매칭 0건(셀렉터 오류 또는 JS 렌더링)
 *   - link_extract_fail: 목록 행은 잡히나 상세 URL 추출 실패(onclick/data-href 어댑터 필요)
 *   - js_suspect       : HTML에 목록/링크가 거의 없음 → Playwright 필요 가능
 *   - fetch_error      : 요청 실패
 *
 * 프로덕션 크롤러(crawl-scholarship-notices.mjs)는 import 시 즉시 실행되므로
 * 재사용은 export된 extractNoticeUrlFromLinkNode로 한정하고, fetch/charset/date는
 * 진단 전용으로 독립 구현합니다(운영 경로 무변경).
 */

const DEFAULT_KEYWORDS = [
  "장학",
  "장학금",
  "학자금",
  "등록금",
  "scholarship",
  "tuition",
  "financial aid",
  "fellowship",
];

const INPUT_CSV_PATH = process.argv[2] ?? "data/notice-sources.csv";
const OUTPUT_DIR = process.argv[3] ?? "exports/notices/diagnostics";
const REQUEST_TIMEOUT_MS = Number(process.env.DIAG_TIMEOUT_MS ?? 15_000);
const REQUEST_RETRY_COUNT = Math.max(0, Number(process.env.DIAG_RETRY_COUNT ?? 2));
const REQUEST_RETRY_BACKOFF_MS = Math.max(200, Number(process.env.DIAG_RETRY_BACKOFF_MS ?? 1_000));
const CONCURRENCY = Math.max(1, Number(process.env.DIAG_CONCURRENCY ?? 4));
const SAMPLE_SIZE = Math.max(1, Number(process.env.DIAG_SAMPLE ?? 25));
const REQUEST_PACING_MS = Math.max(0, Number(process.env.DIAG_PACING_MS ?? 150));
const LIMIT = Number(process.env.DIAG_LIMIT ?? 0);
const FALLBACK_CHARSET = process.env.DIAG_FALLBACK_CHARSET ?? "utf-8";
const SOURCE_ID_PREFIX = cleanText(process.env.DIAG_SOURCE_ID_PREFIX ?? "").toLowerCase();
const RUN_AT = new Date().toISOString();

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function toBoolean(value, defaultValue = true) {
  if (!value) return defaultValue;
  const lowered = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(lowered)) return true;
  if (["false", "0", "no", "n"].includes(lowered)) return false;
  return defaultValue;
}

function readSourceConfig(csvPath) {
  const raw = fs.readFileSync(path.resolve(csvPath), "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) throw new Error("Source CSV is empty.");

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const required = ["source_id", "source_name", "list_url"];
  for (const column of required) {
    if (!(column in index)) throw new Error(`Missing required CSV column: ${column}`);
  }

  return body
    .filter((row) => row.some((cell) => cleanText(cell)))
    .map((row) => ({
      sourceId: cleanText(row[index.source_id]),
      sourceName: cleanText(row[index.source_name]),
      listUrl: cleanText(row[index.list_url]),
      baseUrl: cleanText(row[index.base_url]),
      listItemSelector: cleanText(row[index.list_item_selector]),
      linkSelector: cleanText(row[index.link_selector]),
      titleSelector: cleanText(row[index.title_selector]),
      dateSelector: cleanText(row[index.date_selector]),
      noticeUrlPattern: cleanText(row[index.notice_url_pattern]),
      keywords: parseList(row[index.keywords]),
      enabled: toBoolean(row[index.enabled], true),
    }))
    .filter((source) => source.sourceId && source.sourceName && source.listUrl && source.enabled);
}

function normalizeCharset(value) {
  const normalized = cleanText(value).toLowerCase().replace(/^['"]|['"]$/g, "");
  if (!normalized) return "";
  if (normalized === "utf8") return "utf-8";
  if (["cp949", "ms949", "ks_c_5601-1987"].includes(normalized)) return "euc-kr";
  return normalized;
}

function detectCharsetFromHeaders(contentType) {
  const match = cleanText(contentType).match(/charset\s*=\s*([^;]+)/i);
  return match ? normalizeCharset(match[1]) : "";
}

function detectCharsetFromHtmlProbe(htmlProbe) {
  const probe = cleanText(htmlProbe);
  if (!probe) return "";
  const metaCharset = probe.match(/<meta[^>]*charset\s*=\s*["']?\s*([a-zA-Z0-9._-]+)/i);
  if (metaCharset?.[1]) return normalizeCharset(metaCharset[1]);
  const metaContent = probe.match(
    /<meta[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9._-]+)/i,
  );
  if (metaContent?.[1]) return normalizeCharset(metaContent[1]);
  return "";
}

function decodeHtmlBuffer(buffer, headerCharset) {
  const probe = new TextDecoder("latin1").decode(buffer.subarray(0, 4096));
  const metaCharset = detectCharsetFromHtmlProbe(probe);
  const candidates = [headerCharset, metaCharset, FALLBACK_CHARSET, "utf-8", "euc-kr"]
    .map((value) => normalizeCharset(value))
    .filter(Boolean);
  for (const charset of [...new Set(candidates)]) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(buffer);
    } catch {
      // 다음 후보 charset 시도
    }
  }
  return new TextDecoder("utf-8").decode(buffer);
}

async function fetchHtml(url) {
  let lastError = null;
  for (let attempt = 0; attempt <= REQUEST_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; ScholarshipNoticeDiagnostic/1.0; +https://example.org/bot)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const headerCharset = detectCharsetFromHeaders(response.headers.get("content-type") ?? "");
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { html: decodeHtmlBuffer(bytes, headerCharset), byteLength: bytes.length };
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_RETRY_COUNT) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_RETRY_BACKOFF_MS * (attempt + 1)));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error("fetch failed");
}

function parseNoticeDate(rawText) {
  const text = cleanText(rawText);
  if (!text) return null;
  const patterns = [
    /(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    let year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 100) year += 2000;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function extractListDateText(itemRoot, dateSelector) {
  const candidates = [];
  const seen = new Set();
  const push = (value) => {
    const text = cleanText(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    candidates.push(text);
  };
  if (dateSelector) {
    itemRoot.find(dateSelector).each((_, node) => push(itemRoot.find(node).text()));
  }
  itemRoot.find("time, td, span, div").each((index, node) => {
    if (index > 40) return false;
    push(itemRoot.find(node).text());
    return undefined;
  });
  for (const candidate of candidates) {
    if (parseNoticeDate(candidate)) return candidate;
  }
  return "";
}

function looksMenuLike(title) {
  const normalized = cleanText(title);
  if (normalized.replace(/\s+/g, "").length <= 6) return true;
  return /(장학(금)?\s*(안내|지원|제도|FAQ)?$)|(장학게시판$)|(장학안내$)|(Scholarship\s*\/?\s*Job)/i.test(
    normalized,
  );
}

function containsScholarshipKeyword(text, keywords) {
  const normalized = cleanText(text).toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function detectJsFramework($) {
  if ($("#__NEXT_DATA__").length) return "next";
  if ($("[ng-app], [ng-controller]").length) return "angular";
  if ($("#root, #app").length && $("script[src]").length > 0) return "spa-root";
  return "";
}

function analyzeConfigured(source, $, keywords) {
  const items = $(source.listItemSelector);
  const itemMatchCount = items.length;
  const pattern = source.noticeUrlPattern ? new RegExp(source.noticeUrlPattern) : null;

  let sampled = 0;
  let linkOk = 0;
  let patternOk = 0;
  let dateOk = 0;
  let keywordOk = 0;
  const sampleTitles = [];

  items.each((index, node) => {
    if (sampled >= SAMPLE_SIZE) return false;
    sampled += 1;
    const itemRoot = $(node);
    const linkNode = source.linkSelector
      ? itemRoot.find(source.linkSelector).first()
      : itemRoot.find("a[href]").first();
    const activeLinkNode = linkNode && linkNode.length ? linkNode : null;
    const noticeUrl = activeLinkNode ? extractNoticeUrlFromLinkNode(source, activeLinkNode) : "";
    if (noticeUrl) {
      linkOk += 1;
      if (!pattern || pattern.test(noticeUrl)) patternOk += 1;
    }
    const title = cleanText(
      source.titleSelector
        ? itemRoot.find(source.titleSelector).first().text()
        : activeLinkNode?.text() ?? itemRoot.text(),
    );
    if (parseNoticeDate(extractListDateText(itemRoot, source.dateSelector))) dateOk += 1;
    if (title && containsScholarshipKeyword(title, keywords)) keywordOk += 1;
    if (sampleTitles.length < 5 && title) sampleTitles.push(title.slice(0, 60));
    return undefined;
  });

  return {
    itemMatchCount,
    sampled,
    linkOk,
    patternOk,
    dateOk,
    keywordOk,
    linkRate: sampled ? Number((linkOk / sampled).toFixed(2)) : 0,
    dateRate: sampled ? Number((dateOk / sampled).toFixed(2)) : 0,
    sampleTitles,
  };
}

function analyzeFallback(source, $, keywords) {
  const anchors = $("a[href]");
  const pattern = source.noticeUrlPattern ? new RegExp(source.noticeUrlPattern) : null;

  let keywordHits = 0;
  let menuLikeHits = 0;
  let patternOk = 0;
  const sampleFalsePositives = [];

  anchors.each((_, node) => {
    const anchor = $(node);
    const title = cleanText(anchor.text());
    if (!title || !containsScholarshipKeyword(title, keywords)) return;
    keywordHits += 1;
    const noticeUrl = extractNoticeUrlFromLinkNode(source, anchor);
    if (pattern && noticeUrl && pattern.test(noticeUrl)) patternOk += 1;
    if (looksMenuLike(title)) {
      menuLikeHits += 1;
      if (sampleFalsePositives.length < 5) sampleFalsePositives.push(title.slice(0, 60));
    }
  });

  return {
    anchorCount: anchors.length,
    keywordHits,
    menuLikeHits,
    patternOk,
    falsePositiveRisk: keywordHits ? Number((menuLikeHits / keywordHits).toFixed(2)) : 0,
    sampleFalsePositives,
  };
}

function classify(source, page) {
  const keywords = source.keywords.length ? source.keywords : DEFAULT_KEYWORDS;
  const $ = loadHtml(page.html);
  const anchorCount = $("a[href]").length;
  const bodyTextLength = cleanText($("body").text()).length;
  const jsFramework = detectJsFramework($);

  const base = {
    anchorCount,
    bodyTextLength,
    byteLength: page.byteLength,
    jsFramework: jsFramework || undefined,
  };

  if (source.listItemSelector) {
    const detail = analyzeConfigured(source, $, keywords);
    if (detail.itemMatchCount === 0) {
      const isJs = jsFramework || anchorCount < 5 || bodyTextLength < 300;
      return {
        bucket: isJs ? "js_suspect" : "selector_miss",
        recommendation: isJs
          ? "목록이 HTML에 없음(JS 렌더링 의심) → Playwright 또는 목록 API 확인"
          : "list_item_selector가 아무 것도 매칭 못함 → 셀렉터 수정 필요",
        ...base,
        ...detail,
      };
    }
    if (detail.linkOk === 0) {
      return {
        bucket: "link_extract_fail",
        recommendation:
          "목록 행은 잡히나 상세 URL 추출 실패 → onclick/data-href 어댑터 또는 link_selector 필요",
        ...base,
        ...detail,
      };
    }
    return {
      bucket: "ok",
      recommendation:
        detail.dateRate < 0.5
          ? "링크 추출은 정상이나 날짜 인식률 낮음 → date_selector 보강 권장"
          : "설정 정상",
      ...base,
      ...detail,
    };
  }

  const fallback = analyzeFallback(source, $, keywords);
  if (anchorCount < 5 || bodyTextLength < 300 || jsFramework) {
    return {
      bucket: "js_suspect",
      recommendation: "링크/본문이 거의 없음(JS 렌더링 의심) → Playwright 또는 목록 API 확인",
      ...base,
      ...fallback,
    };
  }
  return {
    bucket: "fallback_scan",
    recommendation:
      "list_item_selector 미설정 → 페이지 전체 링크 스캔 중(오탐 위험). 목록 셀렉터 지정 필요",
    ...base,
    ...fallback,
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
      if (REQUEST_PACING_MS) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_PACING_MS));
      }
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function escapeCsvCell(value) {
  const text = cleanText(value ?? "");
  const escaped = text.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function formatKstDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/-/g, "");
}

async function run() {
  const allSources = readSourceConfig(INPUT_CSV_PATH);
  let sources = SOURCE_ID_PREFIX
    ? allSources.filter((source) => source.sourceId.toLowerCase().startsWith(SOURCE_ID_PREFIX))
    : allSources;
  if (LIMIT > 0) sources = sources.slice(0, LIMIT);
  if (sources.length === 0) throw new Error("No enabled sources matched the filter.");

  console.log(
    `diagnosing sources=${sources.length} prefix=${SOURCE_ID_PREFIX || "all"} concurrency=${CONCURRENCY}`,
  );

  const results = await mapLimit(sources, CONCURRENCY, async (source) => {
    try {
      const page = await fetchHtml(source.listUrl);
      const analysis = classify(source, page);
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        listUrl: source.listUrl,
        hasListItemSelector: Boolean(source.listItemSelector),
        ...analysis,
      };
    } catch (error) {
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        listUrl: source.listUrl,
        hasListItemSelector: Boolean(source.listItemSelector),
        bucket: "fetch_error",
        recommendation: "요청 실패 → URL/타임아웃/차단 여부 확인",
        error: String(error?.message ?? error),
      };
    }
  });

  const bucketOrder = [
    "ok",
    "fallback_scan",
    "selector_miss",
    "link_extract_fail",
    "js_suspect",
    "fetch_error",
  ];
  const byBucket = Object.fromEntries(bucketOrder.map((bucket) => [bucket, 0]));
  const byPrefix = {};
  for (const row of results) {
    byBucket[row.bucket] = (byBucket[row.bucket] ?? 0) + 1;
    const prefix = row.sourceId.split("_")[0];
    byPrefix[prefix] ??= Object.fromEntries(bucketOrder.map((bucket) => [bucket, 0]));
    byPrefix[prefix][row.bucket] += 1;
  }

  const report = {
    runAt: RUN_AT,
    input: path.resolve(INPUT_CSV_PATH),
    sourcePrefix: SOURCE_ID_PREFIX || "all",
    totals: { sourceCount: results.length, byBucket, byPrefix },
    perSource: results,
  };

  const kstDate = formatKstDate();
  const resolvedOutputDir = path.resolve(OUTPUT_DIR);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });

  const jsonPath = path.join(resolvedOutputDir, `source-diagnostics-${kstDate}.json`);
  const latestJsonPath = path.join(resolvedOutputDir, "source-diagnostics-latest.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2), "utf8");

  const csvHeader = [
    "source_id",
    "source_name",
    "bucket",
    "recommendation",
    "list_url",
    "has_list_item_selector",
    "item_match_count",
    "link_rate",
    "date_rate",
    "anchor_count",
    "keyword_hits",
    "menu_like_hits",
    "false_positive_risk",
    "js_framework",
    "error",
  ];
  const csvRows = results.map((row) =>
    [
      row.sourceId,
      row.sourceName,
      row.bucket,
      row.recommendation ?? "",
      row.listUrl,
      row.hasListItemSelector ? "true" : "false",
      row.itemMatchCount ?? "",
      row.linkRate ?? "",
      row.dateRate ?? "",
      row.anchorCount ?? "",
      row.keywordHits ?? "",
      row.menuLikeHits ?? "",
      row.falsePositiveRisk ?? "",
      row.jsFramework ?? "",
      row.error ?? "",
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(","),
  );
  const csvPath = path.join(resolvedOutputDir, `source-diagnostics-${kstDate}.csv`);
  fs.writeFileSync(csvPath, `\uFEFF${[csvHeader.join(","), ...csvRows].join("\r\n")}`, "utf8");

  console.log("");
  console.log("=== bucket summary ===");
  for (const bucket of bucketOrder) {
    console.log(`${bucket.padEnd(18)} ${byBucket[bucket]}`);
  }
  console.log("");
  console.log("=== by university prefix ===");
  for (const [prefix, counts] of Object.entries(byPrefix)) {
    const parts = bucketOrder
      .filter((bucket) => counts[bucket] > 0)
      .map((bucket) => `${bucket}=${counts[bucket]}`);
    console.log(`${prefix.padEnd(10)} ${parts.join(" ")}`);
  }
  console.log("");
  console.log(`json=${jsonPath}`);
  console.log(`csv=${csvPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
