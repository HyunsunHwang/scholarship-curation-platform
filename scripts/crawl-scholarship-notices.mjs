import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread } from "node:worker_threads";
import { load as loadHtml } from "cheerio";
import { Agent as UndiciAgent } from "undici";
import {
  buildBoundedPaginationUrls,
  extractNoticeUrlFromLinkNode,
  getAdapterCapabilityEvidence,
  getListAdapter,
  getSourceAdapterStrategy,
} from "../lib/crawler-adapters/index.mjs";
import { loadSources } from "../lib/notice-sources-loader.mjs";
import {
  normalizeRetryBackoffMs,
  runBoundedCrawlerSource,
} from "../lib/crawler-engine/common-runner.mjs";
import {
  buildCrawlerRunSummary,
  buildCrawlerNoticeCsv,
  buildCrawlerReport,
  buildCandidateDetectionDiagnostics,
  buildOperationalCrawlDiagnostics,
  buildOperationalCrawlDiagnosticsCsv,
  classifyCrawlerFailure,
  sanitizeCrawlerError,
} from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import {
  OPERATIONAL_COMMON_LIST_SELECTORS,
  OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR,
  attachOperationalListParserEvidence,
  collectOperationalListParserEvidence,
} from "../lib/crawler-engine/operational-parser-evidence.mjs";
import { boundedMap, createCrawlerRateLimiter } from "../lib/crawler-engine/execution-policy.mjs";
import {
  finishCrawlerPerformanceTelemetry,
  applyCrawlerTelemetryEvent,
  isCrawlerPerformanceTelemetryActive,
  releaseCrawlerTelemetryWorker,
  startCrawlerPerformanceTelemetry,
  telemetryHttpFinished,
  telemetryHttpStarted,
  telemetryRetryDelay,
  telemetrySourceFinished,
  telemetrySourceStarted,
  telemetrySourcesQueued,
} from "../lib/crawler-engine/crawler-performance-telemetry.mjs";
import { resolveSourceExecutionMode } from "../lib/crawler-engine/source-execution-mode.mjs";
import {
  DEFAULT_SCHOLARSHIP_KEYWORDS,
  detectScholarshipCandidate,
  parseScholarshipNoticeDate,
} from "../lib/detection/scholarship-candidate-detector.mjs";
import { buildDetailFetchPlan } from "../lib/crawler-engine/detail-fetch-planner.mjs";
import {
  buildPreliminaryScholarshipCandidatePlan,
  finalizeScholarshipCandidateDetection,
} from "../lib/crawler-engine/scholarship-candidate-pipeline.mjs";
import { buildSourceRegistryDiagnostics } from "../lib/crawler-engine/source-registry-diagnostics.mjs";
import {
  buildCrawlerWorkItemKey,
  createCrawlerCheckpointSession,
  installCrawlerSignalHandlers,
  parseCrawlerCheckpointArguments,
} from "../lib/crawler-engine/checkpoint.mjs";
import {
  createCrawlerDocumentRuntime,
  isDocumentParsingEnabled,
  summarizeNoticeDocumentEvidence,
} from "../lib/crawler-engine/document-parsing/index.mjs";

// Input: "db:ewha" (preferred) or legacy CSV path like data/notice-sources-cau.csv
const IS_MAIN = isMainThread
  && Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
const CLI_ARGUMENTS = IS_MAIN
  ? parseCrawlerCheckpointArguments(process.argv.slice(2))
  : parseCrawlerCheckpointArguments([]);
const INPUT_ARG = CLI_ARGUMENTS.positional[0] ?? "db";
const OUTPUT_DIR = CLI_ARGUMENTS.positional[1] ?? "exports/notices";
const STATE_FILE_PATH =
  CLI_ARGUMENTS.positional[2] ?? ".crawler/scholarship-notice-state.json";
const REQUEST_TIMEOUT_MS = Number(process.env.CRAWL_TIMEOUT_MS ?? 25_000);
const REQUEST_RETRY_COUNT = Math.max(0, Math.min(3, Number(process.env.CRAWL_RETRY_COUNT ?? 1)));
const REQUEST_RETRY_BACKOFF_MS = Math.max(
  200,
  normalizeRetryBackoffMs(Number(process.env.CRAWL_RETRY_BACKOFF_MS ?? 1_000)),
);
const REQUEST_RETRY_MAX_DELAY_MS = Math.max(
  REQUEST_RETRY_BACKOFF_MS,
  Math.min(30_000, Number(process.env.CRAWL_RETRY_MAX_DELAY_MS ?? 30_000)),
);
const REQUEST_RETRY_JITTER_RATIO = Math.min(
  1,
  Math.max(0, Number(process.env.CRAWL_RETRY_JITTER_RATIO ?? 0.1)),
);
const SOURCE_EXECUTION_TIMEOUT_MS = Math.max(
  REQUEST_TIMEOUT_MS,
  Number(process.env.CRAWL_SOURCE_EXECUTION_TIMEOUT_MS ?? 180_000),
);
const DETAIL_FETCH_ENABLED = process.env.CRAWL_DETAIL_FETCH !== "false";
const DOCUMENT_PARSING_ENABLED = isDocumentParsingEnabled(process.env.CRAWL_DOCUMENT_PARSING_ENABLED);
const DOCUMENT_CACHE_DIRECTORY = process.env.CRAWL_DOCUMENT_CACHE_DIRECTORY ?? ".tmp/engine-phase-3/cache";
const DOCUMENT_MAX_BYTES = Math.max(1, Number(process.env.CRAWL_DOCUMENT_MAX_BYTES ?? 20_000_000));
const DOCUMENT_MAX_PAGES = Math.max(1, Number(process.env.CRAWL_DOCUMENT_MAX_PAGES ?? 20));
const DOCUMENT_MAX_OCR_PAGES = Math.max(0, Number(process.env.CRAWL_DOCUMENT_MAX_OCR_PAGES ?? 3));
const DOCUMENT_OCR_TIMEOUT_MS = Math.max(1, Number(process.env.CRAWL_DOCUMENT_OCR_TIMEOUT_MS ?? 20_000));
const LOOKBACK_DAYS = Number(process.env.CRAWL_LOOKBACK_DAYS ?? 31);
const ALLOW_UNDATED = process.env.CRAWL_ALLOW_UNDATED === "true";
const MAX_ITEMS_PER_SOURCE = Number(process.env.CRAWL_MAX_ITEMS_PER_SOURCE ?? 150);
const MAX_PAGES_PER_SOURCE = Math.max(
  1,
  Math.min(5, Number(process.env.CRAWL_MAX_PAGES_PER_SOURCE ?? 1)),
);
const SOURCE_CONCURRENCY = Math.max(1, Number(process.env.CRAWL_SOURCE_CONCURRENCY ?? 1));
const SOURCE_EXECUTION_MODE = resolveSourceExecutionMode({
  sourceConcurrency: SOURCE_CONCURRENCY,
  isolationRequested: process.env.CRAWL_SOURCE_EXECUTION_ISOLATION === "true",
});
const SOURCE_EXECUTION_ISOLATION_ENABLED = SOURCE_EXECUTION_MODE.isolation_enabled;
const DETAIL_CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.CRAWL_DETAIL_CONCURRENCY ?? 2)));
const HOST_CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.CRAWL_HOST_CONCURRENCY ?? 2)));
const SOURCE_MIN_INTERVAL_MS = Math.max(0, Number(process.env.CRAWL_SOURCE_MIN_INTERVAL_MS ?? 250));
const HOST_MIN_INTERVAL_MS = Math.max(0, Number(process.env.CRAWL_HOST_MIN_INTERVAL_MS ?? 250));
const IGNORE_SEEN = process.env.CRAWL_IGNORE_SEEN === "true";
const FALLBACK_CHARSET = process.env.CRAWL_FALLBACK_CHARSET ?? "utf-8";
const SOURCE_ID_PREFIX = cleanText(process.env.CRAWL_SOURCE_ID_PREFIX ?? "").toLowerCase();
const SOURCE_ID_ALLOWLIST = new Set(
  String(process.env.CRAWL_SOURCE_ID_ALLOWLIST ?? "")
    .split(/[,\s|]+/)
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean),
);
const SOURCE_LEVEL_ALLOWLIST = new Set(
  String(process.env.CRAWL_SOURCE_LEVEL ?? "")
    .split(/[,\s|]+/)
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean),
);
const COLLEGE_NAME_ALLOWLIST = new Set(
  String(process.env.CRAWL_COLLEGE_NAME ?? "")
    .split(/[,\s|]+/)
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean),
);
// Some university WAFs (e.g. cau.ac.kr) silently hang/drop requests whose
// User-Agent contains an identifiable bot string, even though the same page
// loads instantly for a normal browser UA. Default to a browser-like UA to
// avoid mistaking a WAF block for a dead link; still overridable via env.
const REQUEST_USER_AGENT =
  process.env.CRAWL_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
// Linux CI often prefers broken IPv6 for .ac.kr hosts; force IPv4 by default.
const FORCE_IPV4 = process.env.CRAWL_FORCE_IPV4 !== "false";
const DEFAULT_NOTICE_URL_PATTERN =
  /(mode=view|sMode=VIEW_FORM|iBrdContNo=|articleNo=|boardNo=|nttNo=|idx=\d+|no=\d+|wr_id=\d+|boardSeq=\d+|b_idx=\d+|seq=\d+|uid=\d+|artclView\.do|notice-view\?id=|mod=document)/i;
const DEFAULT_DISPATCHER = FORCE_IPV4
  ? new UndiciAgent({
      connect: {
        family: 4,
      },
    })
  : null;
const RUN_AT = new Date().toISOString();

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function formatFetchError(error) {
  const msg = String(error?.message ?? error);
  const cause = error?.cause;
  if (!cause) return msg;
  const code = cause.code ?? cause.errno ?? "";
  const detail = cleanText(cause.message ?? String(cause));
  if (code && detail) return `${msg} (${code}: ${detail})`;
  if (code) return `${msg} (${code})`;
  if (detail) return `${msg} (${detail})`;
  return msg;
}

function normalizeUrlKey(value) {
  try {
    const u = new URL(value);
    u.hash = "";
    let pathname = u.pathname.replace(/\/+$/, "") || "/";
    if (/\/index\.(html?|php|jsp|asp|aspx|do)$/i.test(pathname)) {
      pathname = pathname.replace(/\/index\.(html?|php|jsp|asp|aspx|do)$/i, "") || "/";
    }
    u.pathname = pathname;
    return u.href;
  } catch {
    return cleanText(value).replace(/\/+$/, "");
  }
}

function isLikelyNonDetailNoticeUrl(noticeUrl, listUrl, baseUrl) {
  try {
    const notice = new URL(noticeUrl);
    const noticeKey = normalizeUrlKey(noticeUrl);
    if (listUrl && noticeKey === normalizeUrlKey(listUrl)) return true;
    if (baseUrl && noticeKey === normalizeUrlKey(baseUrl)) return true;

    // Some CMS boards keep detail pages on "/" with query params
    // (e.g. sMode=VIEW_FORM&iBrdContNo=...). Treat those as detail URLs.
    if (DEFAULT_NOTICE_URL_PATTERN.test(`${notice.pathname}${notice.search}`)) {
      return false;
    }

    const pathName = notice.pathname.toLowerCase();
    if (pathName === "/" || pathName === "") return true;
    if (/\/(index|main|home|sitemap)(\.(html?|php|jsp|asp|aspx|do))?$/i.test(pathName)) {
      return true;
    }
    if (/\/(sitemap|login|member|intro|about)(\/|$)/i.test(pathName)) return true;
    return false;
  } catch {
    return false;
  }
}

function extractDateLikeText(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";

  const patterns = [
    /(\d{4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2})/,
    /(\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)/,
    /(\d{2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return cleanText(match[1]);
  }

  return "";
}

function extractListDateText(itemRoot, dateSelector) {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (value) => {
    const text = cleanText(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    candidates.push(text);
  };

  if (dateSelector) {
    itemRoot.find(dateSelector).each((_, node) => {
      pushCandidate(itemRoot.find(node).text());
    });
  }

  itemRoot.find("time, td, span, div").each((index, node) => {
    if (index > 40) return false;
    pushCandidate(itemRoot.find(node).text());
    return undefined;
  });

  for (const candidate of candidates) {
    const dateLike = extractDateLikeText(candidate);
    if (dateLike) return dateLike;
  }

  return "";
}

function normalizeCharset(value) {
  const normalized = cleanText(value).toLowerCase().replace(/^['"]|['"]$/g, "");
  if (!normalized) return "";
  if (normalized === "utf8") return "utf-8";
  if (["cp949", "ms949", "ks_c_5601-1987"].includes(normalized)) return "euc-kr";
  return normalized;
}

function detectCharsetFromHeaders(contentType) {
  const raw = cleanText(contentType);
  if (!raw) return "";
  const match = raw.match(/charset\s*=\s*([^;]+)/i);
  if (!match) return "";
  return normalizeCharset(match[1]);
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
  const uniqueCandidates = [...new Set(candidates)];

  for (const charset of uniqueCandidates) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(buffer);
    } catch {
      // Try the next candidate charset.
    }
  }

  return new TextDecoder("utf-8").decode(buffer);
}

async function readResponseBytesBounded(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    const error = new Error("Response content length exceeds the configured byte limit.");
    error.code = "bounded_limit_exceeded";
    throw error;
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        const error = new Error("Response body exceeds the configured byte limit.");
        error.code = "bounded_limit_exceeded";
        throw error;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function fetchUrlWithMetadata(url, options = {}) {
  const dispatcher = DEFAULT_DISPATCHER;
  let lastError = null;
  const retryCount = Math.max(0, Math.min(3, Number(options.retryCount ?? REQUEST_RETRY_COUNT)));
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? REQUEST_TIMEOUT_MS));
  const maxBytes = Math.max(1, Number(options.maxBytes ?? DOCUMENT_MAX_BYTES));
  const method = options.method ?? "GET";
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const telemetryRequest = telemetryHttpStarted({ url, attempt, kind: options.kind });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    try {
      const response = await fetch(url, {
        method,
        signal,
        dispatcher: dispatcher ?? undefined,
        redirect: "follow",
        headers: {
          "user-agent": REQUEST_USER_AGENT,
          accept: options.accept ?? "*/*",
          "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          ...(options.headers ?? {}),
        },
      });
      if (response.status === 304) {
        telemetryHttpFinished(telemetryRequest, { status: response.status, bytes: 0 });
        return {
          bytes: Buffer.alloc(0),
          httpStatus: response.status,
          finalUrl: response.url || url,
          contentType: response.headers.get("content-type") ?? "",
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
          contentLength: 0,
          retryCount: attempt,
          notModified: true,
        };
      }
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.httpStatus = response.status;
        error.finalUrl = response.url || url;
        error.retryAfter = response.headers.get("retry-after");
        throw error;
      }
      const bytes = options.readBody === false ? Buffer.alloc(0) : await readResponseBytesBounded(response, maxBytes);
      telemetryHttpFinished(telemetryRequest, { status: response.status, bytes: bytes.length });
      return {
        bytes,
        httpStatus: response.status,
        finalUrl: response.url || url,
        contentType: response.headers.get("content-type") ?? "",
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        contentLength: Number(response.headers.get("content-length")) || null,
        retryCount: attempt,
        notModified: false,
      };
    } catch (error) {
      lastError = error;
      telemetryHttpFinished(telemetryRequest, {
        status: error?.httpStatus,
        error,
        timeout: controller.signal.aborted && !options.signal?.aborted,
      });
      if (options.signal?.aborted) break;
      if (attempt < retryCount) {
        const waitMs = REQUEST_RETRY_BACKOFF_MS * (attempt + 1);
        telemetryRetryDelay(waitMs);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error("fetch failed");
}

export async function fetchHtmlWithMetadata(url, options = {}) {
  const response = await fetchUrlWithMetadata(url, {
    ...options,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    maxBytes: options.maxBytes ?? DOCUMENT_MAX_BYTES,
  });
  const headerCharset = detectCharsetFromHeaders(response.contentType);
  return { ...response, html: decodeHtmlBuffer(response.bytes, headerCharset) };
}

export async function fetchHtml(url, options = {}) {
  return (await fetchHtmlWithMetadata(url, options)).html;
}

export async function inspectCrawlerAsset(asset, context = {}) {
  const response = await fetchUrlWithMetadata(asset.url, {
    method: "HEAD",
    readBody: false,
    retryCount: 0,
    timeoutMs: context.timeoutMs ?? REQUEST_TIMEOUT_MS,
    maxBytes: context.maxBytes ?? DOCUMENT_MAX_BYTES,
  });
  return {
    finalUrl: response.finalUrl,
    mimeType: response.contentType.split(";")[0],
    etag: response.etag,
    lastModified: response.lastModified,
    contentLength: response.contentLength,
  };
}

export async function fetchCrawlerAsset(asset, context = {}) {
  const response = await fetchUrlWithMetadata(asset.url, {
    method: "GET",
    retryCount: 0,
    timeoutMs: context.timeoutMs ?? REQUEST_TIMEOUT_MS,
    maxBytes: context.maxBytes ?? DOCUMENT_MAX_BYTES,
  });
  return {
    bytes: response.bytes,
    finalUrl: response.finalUrl,
    mimeType: response.contentType.split(";")[0],
    etag: response.etag,
    lastModified: response.lastModified,
    contentLength: response.contentLength,
  };
}

export function createAuthoritativeDocumentRuntime(options = {}) {
  const requestLimiter = options.requestLimiter ?? null;
  const wrapAssetTransport = (transport) => async (asset, context = {}) => {
    const permit = requestLimiter
      ? await requestLimiter.acquire({
          url: asset.url,
          sourceKey: context.source?.sourceKey ?? context.source?.sourceId,
          signal: context.signal,
        })
      : null;
    try { return await transport(asset, context); } finally { permit?.release(); }
  };
  return createCrawlerDocumentRuntime({
    enabled: options.enabled ?? DOCUMENT_PARSING_ENABLED,
    cacheDirectory: options.cacheDirectory ?? DOCUMENT_CACHE_DIRECTORY,
    inspectAsset: wrapAssetTransport(options.inspectAsset ?? inspectCrawlerAsset),
    fetchAsset: wrapAssetTransport(options.fetchAsset ?? fetchCrawlerAsset),
    ocrAdapter: options.ocrAdapter,
    hwpBinaryAdapter: options.hwpBinaryAdapter,
    parserOptions: options.parserOptions ?? {
      maxBytes: DOCUMENT_MAX_BYTES,
      maxPages: DOCUMENT_MAX_PAGES,
      maxOcrPages: DOCUMENT_MAX_OCR_PAGES,
      ocrTimeoutMs: DOCUMENT_OCR_TIMEOUT_MS,
    },
  });
}

export function extractFromList(source, html) {
  const $ = loadHtml(html);
  const results = [];
  const seen = new Set();
  const sourceId = cleanText(source.sourceId).toLowerCase();
  const finalize = (items = results) => attachOperationalListParserEvidence(
    items,
    collectOperationalListParserEvidence(source, html, items),
  );

  const addBoardItem = (link, title, dateText, noticeUrlOverride = "") => {
    const noticeUrl = noticeUrlOverride || extractNoticeUrlFromLinkNode(source, link);
    const normalizedTitle = cleanText(title);
    if (!noticeUrl || !normalizedTitle || seen.has(noticeUrl)) return;
    seen.add(noticeUrl);
    results.push({
      sourceId: source.sourceId,
      universitySlug: source.universitySlug,
      universityId: source.universityId,
      collegeId: source.collegeId,
      departmentId: source.departmentId,
      collegeName: source.collegeName,
      departmentName: source.departmentName,
      sourceLevel: source.sourceLevel,
      sourceName: source.sourceName,
      listUrl: source.listUrl,
      noticeUrl,
      title: normalizedTitle,
      dateText: cleanText(dateText),
    });
  };

  if (sourceId === "cau_001") {
    $("tr").each((_, node) => {
      const row = $(node);
      const link = row.find('a[href*="sub06_01_view.php"][href*="bbsIdx="]').first();
      if (!link.length) return;
      const noticeUrl = extractNoticeUrlFromLinkNode(source, link);
      const title = cleanText(link.text());
      if (!noticeUrl || !title || seen.has(noticeUrl)) return;
      seen.add(noticeUrl);
      results.push({
        sourceId: source.sourceId,
        universitySlug: source.universitySlug,
        universityId: source.universityId,
        collegeId: source.collegeId,
        departmentId: source.departmentId,
        collegeName: source.collegeName,
        departmentName: source.departmentName,
        sourceLevel: source.sourceLevel,
        sourceName: source.sourceName,
        listUrl: source.listUrl,
        noticeUrl,
        title,
        dateText: extractListDateText(row, source.dateSelector),
      });
    });
    return finalize();
  }

  if (sourceId === "cau_003") {
    $("table.board-table tbody tr").each((_, node) => {
      const row = $(node);
      const link = row.find("a.board-page-link").first();
      const articleId = cleanText(link.attr("href")).match(
        /javascript:view\(\s*['"](\d+)['"]/i,
      )?.[1];
      if (!articleId) return;
      const target = new URL(source.listUrl);
      target.search = "";
      target.searchParams.set("p_idx", articleId);
      target.searchParams.set("p_mode", "view");
      addBoardItem(
        link,
        link.text(),
        row.find(".board-col--mb .date").first().text() || row.find("td").last().text(),
        target.toString(),
      );
    });
    return finalize();
  }

  if (sourceId === "cau_007") {
    $("ul.board_list > li").each((_, node) => {
      const row = $(node);
      const link = row.find('a[href*="seq="]').first();
      addBoardItem(
        link,
        row.find(".board_list_tit").first().text(),
        row.find(".board_list_info .line").last().text(),
      );
    });
    return finalize();
  }

  if (sourceId === "cau_008") {
    $(".bbs-list-row").each((_, node) => {
      const row = $(node);
      const link = row.find('a[href*="bgu=view"][href*="idx="]').first();
      addBoardItem(
        link,
        row.find(".bbs-subject-txt").first().text(),
        row.find(".bbs-inline").eq(1).text(),
      );
    });
    return finalize();
  }

  const pushResult = (node, index) => {
    const itemRoot = node ? $(node) : null;
    const linkNode = itemRoot
      ? source.linkSelector
        ? itemRoot.find(source.linkSelector).first()
        : itemRoot.find("a[href]").first()
      : null;
    const fallbackLinkNode = !itemRoot
      ? $("a[href], a[onclick], a[data-href], a[data-url], a[data-link]").eq(index)
      : null;
    const activeLinkNode = linkNode && linkNode.length ? linkNode : fallbackLinkNode;

    if (activeLinkNode?.closest(OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR).length) return;
    if (itemRoot?.closest(OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR).length) return;

    const noticeUrl = extractNoticeUrlFromLinkNode(source, activeLinkNode);
    if (!noticeUrl || seen.has(noticeUrl)) return;

    const titleRaw = itemRoot
      ? source.titleSelector
        ? itemRoot.find(source.titleSelector).first().text()
        : activeLinkNode?.text() ?? itemRoot.text()
      : activeLinkNode?.text() ?? "";
    const title = cleanText(titleRaw);
    if (!title) return;
    if (isLikelyNonDetailNoticeUrl(noticeUrl, source.listUrl, source.baseUrl)) return;

    const dateText = itemRoot ? extractListDateText(itemRoot, source.dateSelector) : "";

    seen.add(noticeUrl);
    results.push({
      sourceId: source.sourceId,
      universitySlug: source.universitySlug,
      universityId: source.universityId,
      collegeId: source.collegeId,
      departmentId: source.departmentId,
      collegeName: source.collegeName,
      departmentName: source.departmentName,
      sourceLevel: source.sourceLevel,
      sourceName: source.sourceName,
      listUrl: source.listUrl,
      noticeUrl,
      title,
      dateText,
    });
  };

  if (source.listItemSelector) {
    $(source.listItemSelector).each((index, node) => pushResult(node, index));
  } else {
    const commonSelector = OPERATIONAL_COMMON_LIST_SELECTORS.find((selector) => $(selector).length > 0);
    if (commonSelector) {
      $(commonSelector).each((index, node) => pushResult(node, index));
    } else {
      $("a[href], a[onclick], a[data-href], a[data-url], a[data-link]").each((index) => pushResult(null, index));
    }
  }

  if (source.noticeUrlPattern) {
    const pattern = new RegExp(source.noticeUrlPattern);
    return finalize(results.filter((item) => pattern.test(item.noticeUrl)));
  }
  // When a list-item selector exists but no URL pattern was configured,
  // prefer detail-like URLs over menu/home links from the same board.
  if (source.listItemSelector) {
    const patterned = results.filter((item) => DEFAULT_NOTICE_URL_PATTERN.test(item.noticeUrl));
    if (patterned.length > 0) return finalize(patterned);
  }
  return finalize();
}

function trimItems(items, maxItems) {
  if (!Number.isFinite(maxItems) || maxItems <= 0) return items;
  return items.slice(0, maxItems);
}

async function mapLimit(items, limit, mapper, options = {}) {
  return boundedMap(items, limit, mapper, options);
}

export { parseScholarshipNoticeDate as parseNoticeDate };

function loadState(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return { seen: {} };
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || typeof parsed.seen !== "object") {
    return { seen: {} };
  }
  return parsed;
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

export function buildConditionalRequestHeaders({ etag, lastModified } = {}) {
  const headers = {};
  const normalizedEtag = cleanText(etag);
  const normalizedLastModified = cleanText(lastModified);
  if (normalizedEtag) headers["if-none-match"] = normalizedEtag;
  if (normalizedLastModified) headers["if-modified-since"] = normalizedLastModified;
  return headers;
}

function scholarshipCandidateOptions(source) {
  return {
    keywords: Array.isArray(source.keywords) && source.keywords.length > 0
      ? source.keywords
      : DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays: LOOKBACK_DAYS,
    allowUndated: ALLOW_UNDATED,
    now: new Date(RUN_AT),
  };
}

export function buildSourceExecutionTimeoutResult(source, startedAt, startedMs, stageEvents) {
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.now() - startedMs);
  return {
    source_key: source.sourceId,
    source_id: source.sourceId,
    source_name: source.sourceName,
    strategy: getSourceAdapterStrategy(source),
    result_status: "timeout",
    observed_count: 0,
    matched_count: 0,
    notices: [],
    error_code: "source_execution_timeout",
    error_message: "Source execution exceeded its isolated hard timeout.",
    timeout: true,
    transport_error_code: null,
    transport_error_category: null,
    transport_error_retryable: null,
    total_attempt_count: 1,
    attempt_history: [{
      sequence: 1,
      status: "timeout",
      retryable: false,
      duration_ms: durationMs,
      reason_code: "source_execution_timeout",
      transport_error_code: null,
      transport_error_category: null,
      transport_error_retryable: null,
      timeout: true,
      item_count: 0,
      started_at: startedAt,
      finished_at: finishedAt,
      error_summary: "Source execution exceeded its isolated hard timeout.",
      retry_delay_ms: 0,
    }],
    retry_backoff_ms: REQUEST_RETRY_BACKOFF_MS,
    total_retry_delay_ms: 0,
    retried: false,
    recovered_after_retry: false,
    retry_exhausted: false,
    duration_ms: durationMs,
    started_at: startedAt,
    finished_at: finishedAt,
    final_reason_code: "source_execution_timeout",
    final_error_summary: "Source execution exceeded its isolated hard timeout.",
    final_transport_error_code: null,
    final_transport_error_category: null,
    final_transport_error_retryable: null,
    execution_stage_evidence: {
      source_execution_timeout_ms: SOURCE_EXECUTION_TIMEOUT_MS,
      timed_out: true,
      last_observed_stage: stageEvents.at(-1)?.stage ?? null,
      stage_events: stageEvents,
    },
  };
}

export function buildSourceExecutionErrorResult(source, startedAt, startedMs, stageEvents, safeError) {
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.now() - startedMs);
  const status = cleanText(safeError?.status ?? safeError?.result_status) || "network_error";
  const errorCode = cleanText(safeError?.error_code) || status;
  const errorMessage = sanitizeCrawlerError(safeError?.error_message) || status;
  const transportErrorCode = cleanText(safeError?.transport_error_code) || null;
  const transportErrorCategory = cleanText(safeError?.transport_error_category) || "unknown";
  const transportErrorRetryable =
    typeof safeError?.transport_error_retryable === "boolean"
      ? safeError.transport_error_retryable
      : null;
  return {
    source_key: source.sourceId,
    source_id: source.sourceId,
    source_name: source.sourceName,
    strategy: getSourceAdapterStrategy(source),
    result_status: status,
    observed_count: 0,
    matched_count: 0,
    notices: [],
    error_code: errorCode,
    error_message: errorMessage,
    timeout: status === "timeout",
    transport_error_code: transportErrorCode,
    transport_error_category: transportErrorCategory,
    transport_error_retryable: transportErrorRetryable,
    total_attempt_count: 1,
    attempt_history: [{
      sequence: 1,
      status,
      retryable: transportErrorRetryable === true,
      duration_ms: durationMs,
      reason_code: errorCode,
      transport_error_code: transportErrorCode,
      transport_error_category: transportErrorCategory,
      transport_error_retryable: transportErrorRetryable,
      timeout: status === "timeout",
      item_count: 0,
      started_at: startedAt,
      finished_at: finishedAt,
      error_summary: errorMessage,
      retry_delay_ms: 0,
    }],
    retry_backoff_ms: REQUEST_RETRY_BACKOFF_MS,
    total_retry_delay_ms: 0,
    retried: false,
    recovered_after_retry: false,
    retry_exhausted: false,
    duration_ms: durationMs,
    started_at: startedAt,
    finished_at: finishedAt,
    final_reason_code: errorCode,
    final_error_summary: errorMessage,
    final_transport_error_code: transportErrorCode,
    final_transport_error_category: transportErrorCategory,
    final_transport_error_retryable: transportErrorRetryable,
    execution_stage_evidence: {
      source_execution_timeout_ms: SOURCE_EXECUTION_TIMEOUT_MS,
      timed_out: false,
      last_observed_stage: stageEvents.at(-1)?.stage ?? null,
      stage_events: stageEvents,
    },
  };
}

async function executeSourceInWorker({
  source,
  inventoryRows,
  completedWorkItemKeys,
  checkpointSession,
  seenNoticeUrls,
}) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const stageEvents = [];
  const workerId = `${source.sourceId}:${randomUUID()}`;
  const worker = new Worker(new URL("../lib/crawler-engine/source-execution-worker.mjs", import.meta.url), {
    workerData: {
      workerId,
      source,
      inventoryRows,
      completedWorkItemKeys,
      config: {
        lookbackDays: LOOKBACK_DAYS,
        allowUndated: ALLOW_UNDATED,
        maxItems: MAX_ITEMS_PER_SOURCE,
        maxPages: MAX_PAGES_PER_SOURCE,
        fetchDetails: DETAIL_FETCH_ENABLED,
        timeoutMs: REQUEST_TIMEOUT_MS,
        retryCount: REQUEST_RETRY_COUNT,
        retryBackoffMs: REQUEST_RETRY_BACKOFF_MS,
        retryMaximumDelayMs: REQUEST_RETRY_MAX_DELAY_MS,
        retryJitterRatio: REQUEST_RETRY_JITTER_RATIO,
        detailConcurrency: DETAIL_CONCURRENCY,
        sourceMinimumIntervalMs: SOURCE_MIN_INTERVAL_MS,
        hostMinimumIntervalMs: HOST_MIN_INTERVAL_MS,
        hostConcurrency: HOST_CONCURRENCY,
        telemetryEnabled: isCrawlerPerformanceTelemetryActive(),
        runAt: RUN_AT,
        seenNoticeUrls,
      },
    },
  });
  return new Promise((resolve) => {
    let settled = false;
    const finish = async (value, releaseReason = "worker_exit") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      releaseCrawlerTelemetryWorker(workerId, releaseReason);
      await worker.terminate().catch(() => {});
      resolve(value);
    };
    const timer = setTimeout(() => {
      void finish({
        executionResult: buildSourceExecutionTimeoutResult(source, startedAt, startedMs, stageEvents),
        notices: [],
        timedOut: true,
      }, "source_execution_timeout");
    }, SOURCE_EXECUTION_TIMEOUT_MS);
    worker.on("message", (message) => {
      if (message?.type === "telemetry_event") {
        applyCrawlerTelemetryEvent({
          ...message.event,
          worker_id: workerId,
        });
      } else if (message?.type === "stage") {
        stageEvents.push({
          stage: cleanText(message.stage),
          status: cleanText(message.status),
          detail_url: cleanText(message.detail_url) || null,
          observed_at: new Date().toISOString(),
        });
        if (stageEvents.length > 80) stageEvents.shift();
      } else if (message?.type === "work_item") {
        void checkpointSession?.recordWorkItem(message);
      } else if (message?.type === "result") {
        const executionResult = {
          ...message.execution_result,
          execution_stage_evidence: {
            source_execution_timeout_ms: SOURCE_EXECUTION_TIMEOUT_MS,
            timed_out: false,
            last_observed_stage: stageEvents.at(-1)?.stage ?? null,
            stage_events: stageEvents,
          },
        };
        void finish(
          { executionResult, notices: message.notices ?? executionResult.notices ?? [], timedOut: false },
          "worker_exit",
        );
      } else if (message?.type === "error") {
        void finish({
          executionResult: buildSourceExecutionErrorResult(
            source,
            startedAt,
            startedMs,
            stageEvents,
            message.error,
          ),
          notices: [],
          timedOut: false,
        }, "worker_error");
      }
    });
    worker.on("error", (error) => void finish({ error, timedOut: false }, "worker_error"));
    worker.on("exit", (code) => {
      if (!settled) {
        const error = new Error(`source_worker_exit_${code}`);
        error.code = "source_worker_exit";
        void finish({ error, timedOut: false }, "worker_exit");
      }
    });
  });
}

async function run({ signal } = {}) {
  const loaded = await loadSources(INPUT_ARG);
  const configuredSources = loaded.sources;
  console.log(`source_input=${loaded.inputLabel} mode=${loaded.mode} loaded=${configuredSources.length}`);
  const configuredPrefixes = [...new Set(configuredSources.map((source) => source.sourceId.split("_")[0]))];
  if (!SOURCE_ID_PREFIX && configuredPrefixes.length > 1) {
    console.warn(
      `warning=mixed_source_prefixes count=${configuredPrefixes.length} prefixes=${configuredPrefixes.join("|")}`,
    );
  }
  const sources = configuredSources.filter((source) => {
    const sourceId = source.sourceId.toLowerCase();
    const sourceLevel = cleanText(source.sourceLevel).toLowerCase();
    const collegeName = cleanText(source.collegeName).toLowerCase();
    if (SOURCE_ID_PREFIX && !sourceId.startsWith(SOURCE_ID_PREFIX)) {
      return false;
    }
    if (SOURCE_ID_ALLOWLIST.size > 0 && !SOURCE_ID_ALLOWLIST.has(sourceId)) {
      return false;
    }
    if (SOURCE_LEVEL_ALLOWLIST.size > 0 && !SOURCE_LEVEL_ALLOWLIST.has(sourceLevel)) {
      return false;
    }
    if (COLLEGE_NAME_ALLOWLIST.size > 0 && !COLLEGE_NAME_ALLOWLIST.has(collegeName)) {
      return false;
    }
    return true;
  });
  if (sources.length === 0) {
    throw new Error(
      SOURCE_ID_PREFIX
        ? `No enabled sources matched source prefix: ${SOURCE_ID_PREFIX}`
        : "No enabled sources found (check source level/college filters).",
    );
  }
  const state = loadState(STATE_FILE_PATH);
  const seen = { ...state.seen };
  const crawled = [];
  const allMatched = [];
  const allNew = [];
  const stats = [];
  const genericHtmlStrategy = createGenericHtmlStrategy({ parseListHtml: extractFromList });
  const inventoryRows = configuredSources.map((source) => ({ source_id: source.sourceId }));
  const requestLimiter = createCrawlerRateLimiter({
    minimumSourceIntervalMs: SOURCE_MIN_INTERVAL_MS,
    minimumHostIntervalMs: HOST_MIN_INTERVAL_MS,
    maximumHostConcurrency: HOST_CONCURRENCY,
  });
  const documentRuntime = createAuthoritativeDocumentRuntime({ requestLimiter });
  const checkpointSession = await createCrawlerCheckpointSession({
    checkpointPath: CLI_ARGUMENTS.checkpoint_path,
    resume: CLI_ARGUMENTS.resume,
    runIdentity: CLI_ARGUMENTS.run_identity ?? (CLI_ARGUMENTS.resume ? undefined : `crawl-notices-${RUN_AT}`),
    sourceKeys: sources.map((source) => source.sourceId),
    configuration: {
      runner_contract_version: "engine-phase-2-common-runner-v1",
      source_concurrency: SOURCE_CONCURRENCY,
      detail_concurrency: DETAIL_CONCURRENCY,
      retry_count: REQUEST_RETRY_COUNT,
      retry_backoff_ms: REQUEST_RETRY_BACKOFF_MS,
      retry_maximum_delay_ms: REQUEST_RETRY_MAX_DELAY_MS,
      retry_jitter_ratio: REQUEST_RETRY_JITTER_RATIO,
      timeout_ms: REQUEST_TIMEOUT_MS,
      source_execution_isolation_enabled: SOURCE_EXECUTION_ISOLATION_ENABLED,
      source_execution_mode: SOURCE_EXECUTION_MODE.mode,
      source_execution_timeout_ms: SOURCE_EXECUTION_TIMEOUT_MS,
      source_minimum_interval_ms: SOURCE_MIN_INTERVAL_MS,
      host_minimum_interval_ms: HOST_MIN_INTERVAL_MS,
      host_concurrency: HOST_CONCURRENCY,
      fetch_details: DETAIL_FETCH_ENABLED,
      document_parsing_enabled: documentRuntime.enabled,
      maximum_items_per_source: MAX_ITEMS_PER_SOURCE,
      maximum_pages_per_source: MAX_PAGES_PER_SOURCE,
      lookback_days: LOOKBACK_DAYS,
      allow_undated: ALLOW_UNDATED,
      ignore_seen: IGNORE_SEEN,
    },
  });
  const pendingSources = sources.filter((source) => !checkpointSession?.shouldSkipSource(source.sourceId));

  const processSource = async (source) => {
    const sourceStartedAt = new Date().toISOString();
    const sourceStartedMs = Date.now();
    let executionResult = null;
    try {
      const workerResult = SOURCE_EXECUTION_ISOLATION_ENABLED
        ? await executeSourceInWorker({
          source,
          inventoryRows,
          completedWorkItemKeys: checkpointSession?.snapshot().completed_work_item_keys ?? [],
          checkpointSession,
          seenNoticeUrls: Object.keys(seen),
        })
        : null;
      if (workerResult?.error) throw workerResult.error;
      executionResult = workerResult?.executionResult ?? null;
      if (workerResult && (workerResult.timedOut || !["success", "empty_observed", "partial"].includes(executionResult.result_status))) {
        return {
          sourceId: source.sourceId,
          universitySlug: source.universitySlug,
          universityId: source.universityId,
          collegeId: source.collegeId,
          departmentId: source.departmentId,
          sourceLevel: source.sourceLevel,
          collegeName: source.collegeName,
          sourceName: source.sourceName,
          adapterStrategy: getSourceAdapterStrategy(source),
          error: executionResult.final_error_summary || executionResult.final_reason_code || executionResult.result_status,
          detailItems: [],
          matched: [],
          executionResult,
        };
      }
      let detailItems = workerResult?.notices ?? [];
      if (!workerResult) {
      const listAdapter = getListAdapter(source.adapter);
      let listItems;
      detailItems = [];
      if (listAdapter) {
        // 어댑터 소스: 목록 API가 제목/날짜/본문 요약을 모두 제공하므로
        // 기본 HTML 파싱과 개별 상세 요청을 건너뜁니다.
        listItems = trimItems(
          await listAdapter(source, {
            lookbackDays: LOOKBACK_DAYS,
            allowUndated: ALLOW_UNDATED,
            maxItems: MAX_ITEMS_PER_SOURCE,
          }),
          MAX_ITEMS_PER_SOURCE,
        );
        const candidateOptions = scholarshipCandidateOptions(source);
        const { preliminaryCandidateResults, detailFetchPlan } =
          buildPreliminaryScholarshipCandidatePlan(listItems, {
            detector: detectScholarshipCandidate,
            planner: buildDetailFetchPlan,
            detectorOptions: candidateOptions,
            plannerOptions: { seenNoticeUrls: Object.keys(seen) },
          });
        detailItems = detailFetchPlan.fetch.filter((notice) => {
          const workItemKey = buildCrawlerWorkItemKey(source.sourceId, notice);
          return !checkpointSession?.shouldSkipWorkItem(workItemKey);
        });
        if (documentRuntime.enabled) {
          detailItems = await mapLimit(detailItems, DETAIL_CONCURRENCY, async (notice) => {
            const processedNotice = await documentRuntime.processNoticeDocuments({ source, notice, signal });
            const workItemKey = buildCrawlerWorkItemKey(source.sourceId, processedNotice);
            await checkpointSession?.recordWorkItem({ sourceKey: source.sourceId, workItemKey });
            return processedNotice;
          }, { signal, settleTimeoutMs: CLI_ARGUMENTS.settle_timeout_ms });
          detailItems = detailItems.filter((notice) => !notice?.__bounded_map_abandoned && !notice?.__bounded_map_error);
        }
        const candidateDetection = finalizeScholarshipCandidateDetection({
          listObservations: listItems,
          preliminaryCandidateResults,
          detailFetchPlan,
          detailObservations: detailItems,
          detector: detectScholarshipCandidate,
          detectorOptions: candidateOptions,
          detailFetchRequired: false,
        });
        const finishedAt = new Date().toISOString();
        const durationMs = Math.max(0, Date.now() - sourceStartedMs);
        const resultStatus = listItems.length > 0 ? "success" : "empty_observed";
        executionResult = {
          source_key: source.sourceId,
          source_id: source.sourceId,
          source_name: source.sourceName,
          strategy: getSourceAdapterStrategy(source),
          result_status: resultStatus,
          observed_count: listItems.length,
          matched_count: candidateDetection.final_summary.candidate_count,
          notices: detailItems,
          candidate_detection: candidateDetection,
          item_summary: {
            observed_list_item_count: listItems.length,
            eligible_count: detailFetchPlan.fetch.length,
            completed_count: detailItems.length,
            successful_count: detailItems.length,
            failed_count: 0,
            cancelled_count: 0,
            preliminary_skip_count: detailFetchPlan.skip.length,
            resumed_skip_count: detailFetchPlan.fetch.length - detailItems.length,
          },
          total_attempt_count: 1,
          attempt_history: [{
            sequence: 1,
            status: resultStatus,
            retryable: false,
            duration_ms: durationMs,
            reason_code: resultStatus,
            timeout: false,
            item_count: listItems.length,
            started_at: sourceStartedAt,
            finished_at: finishedAt,
            error_summary: "",
            retry_delay_ms: 0,
          }],
          retry_backoff_ms: REQUEST_RETRY_BACKOFF_MS,
          total_retry_delay_ms: 0,
          retried: false,
          recovered_after_retry: false,
          retry_exhausted: false,
          duration_ms: durationMs,
          started_at: sourceStartedAt,
          finished_at: finishedAt,
          final_reason_code: resultStatus,
          final_error_summary: "",
          adapter_evidence: getAdapterCapabilityEvidence(source.adapter),
        };
      } else {
        const commonResult = await runBoundedCrawlerSource({
          source,
          inventoryRows,
          strategy: genericHtmlStrategy,
          fetchHtml,
          listUrls: buildBoundedPaginationUrls(source, MAX_PAGES_PER_SOURCE),
          maxItems: MAX_ITEMS_PER_SOURCE,
          fetchDetails: DETAIL_FETCH_ENABLED,
          timeoutMs: REQUEST_TIMEOUT_MS,
          retryCount: REQUEST_RETRY_COUNT,
          retryBackoffMs: REQUEST_RETRY_BACKOFF_MS,
          maximumRetryDelayMs: REQUEST_RETRY_MAX_DELAY_MS,
          retryJitterRatio: REQUEST_RETRY_JITTER_RATIO,
          detailConcurrency: DETAIL_CONCURRENCY,
          requestLimiter,
          completedWorkItemKeys: checkpointSession?.snapshot().completed_work_item_keys ?? [],
          onWorkItemSettled: checkpointSession
            ? (item) => checkpointSession.recordWorkItem(item)
            : null,
          processNoticeDocuments: documentRuntime.processNoticeDocuments,
          settleTimeoutMs: CLI_ARGUMENTS.settle_timeout_ms,
          signal,
          candidateDetector: detectScholarshipCandidate,
          detailFetchPlanner: buildDetailFetchPlan,
          candidateDetectionOptions: scholarshipCandidateOptions(source),
          detailFetchPlannerOptions: { seenNoticeUrls: Object.keys(seen) },
        });
        executionResult = commonResult;
        if (!["success", "empty_observed", "partial"].includes(commonResult.result_status)) {
          return {
            sourceId: source.sourceId,
            universitySlug: source.universitySlug,
            universityId: source.universityId,
            collegeId: source.collegeId,
            departmentId: source.departmentId,
            sourceLevel: source.sourceLevel,
            collegeName: source.collegeName,
            sourceName: source.sourceName,
            adapterStrategy: getSourceAdapterStrategy(source),
            error: commonResult.final_error_summary || commonResult.result_status,
            detailItems: [],
            matched: [],
            executionResult,
          };
        }
        listItems = commonResult.notices;
        detailItems = commonResult.notices;
      }
      }
      detailItems = detailItems.map((item) => ({
        ...item,
        sourceId: item.sourceId ?? source.sourceId,
        sourceName: item.sourceName ?? source.sourceName,
        universitySlug: item.universitySlug ?? source.universitySlug,
        universityId: item.universityId ?? source.universityId,
        collegeId: item.collegeId ?? source.collegeId,
        departmentId: item.departmentId ?? source.departmentId,
        collegeName: item.collegeName ?? source.collegeName,
        departmentName: item.departmentName ?? source.departmentName,
        sourceLevel: item.sourceLevel ?? source.sourceLevel,
      }));

      const finalCandidateResults =
        executionResult?.candidate_detection?.final_candidate_results ?? [];
      const datedItems = detailItems.map((item, index) => ({
        ...item,
        parsedDate: finalCandidateResults[index]?.dateResult?.parsedValue ?? "",
        scholarshipCandidateResult: finalCandidateResults[index] ?? null,
      }));
      const matched = datedItems.filter((_item, index) =>
        finalCandidateResults[index]?.eligibleForDownstream === true);
      const preliminarySummary =
        executionResult?.candidate_detection?.preliminary_summary ?? {};
      const finalSummary = executionResult?.candidate_detection?.final_summary ?? {};
      return {
        sourceId: source.sourceId,
        universitySlug: source.universitySlug,
        universityId: source.universityId,
        collegeId: source.collegeId,
        departmentId: source.departmentId,
        sourceLevel: source.sourceLevel,
        collegeName: source.collegeName,
        sourceName: source.sourceName,
        adapterStrategy: getSourceAdapterStrategy(source),
        detailItems,
        matched,
        filterMetrics: {
          observed_count:
            executionResult?.candidate_detection?.observed_list_item_count
            ?? detailItems.length,
          parsed_date_count: finalCandidateResults.filter((result) =>
            Boolean(result?.dateResult?.parsedValue)).length,
          keyword_match_count: finalCandidateResults.filter((result) =>
            result?.keywordResult?.matched === true).length,
          date_match_count: matched.length,
          preliminary_candidate_count: preliminarySummary.candidate_count ?? 0,
          preliminary_not_candidate_count: preliminarySummary.not_candidate_count ?? 0,
          preliminary_out_of_range_count: preliminarySummary.out_of_range_count ?? 0,
          preliminary_undetermined_count: preliminarySummary.undetermined_count ?? 0,
          detail_fetch_planned_count:
            executionResult?.candidate_detection?.detail_fetch_planned_count ?? 0,
          detail_fetch_completed_count:
            executionResult?.candidate_detection?.detail_fetch_completed_count ?? 0,
          detail_fetch_skipped_count:
            executionResult?.candidate_detection?.detail_fetch_skipped_count ?? 0,
          requests_avoided_by_preliminary_filter:
            executionResult?.candidate_detection?.requests_avoided_by_preliminary_filter ?? 0,
          final_candidate_count: finalSummary.candidate_count ?? 0,
          final_not_candidate_count: finalSummary.not_candidate_count ?? 0,
          final_out_of_range_count: finalSummary.out_of_range_count ?? 0,
          final_undetermined_count: finalSummary.undetermined_count ?? 0,
          candidate_detection_error_count:
            (preliminarySummary.detection_error_count ?? 0)
            + (finalSummary.detection_error_count ?? 0),
        },
        error: "",
        executionResult,
      };
    } catch (error) {
      const status = classifyCrawlerFailure(error, "network_error");
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.now() - sourceStartedMs);
      const errorSummary = sanitizeCrawlerError(error);
      executionResult ??= {
        source_key: source.sourceId,
        source_id: source.sourceId,
        source_name: source.sourceName,
        strategy: getSourceAdapterStrategy(source),
        result_status: status,
        observed_count: 0,
        notices: [],
        total_attempt_count: 1,
        attempt_history: [{
          sequence: 1,
          status,
          retryable: false,
          duration_ms: durationMs,
          reason_code: status,
          timeout: status === "timeout",
          item_count: 0,
          started_at: sourceStartedAt,
          finished_at: finishedAt,
          error_summary: errorSummary,
          retry_delay_ms: 0,
        }],
        retry_backoff_ms: REQUEST_RETRY_BACKOFF_MS,
        total_retry_delay_ms: 0,
        retried: false,
        recovered_after_retry: false,
        retry_exhausted: false,
        duration_ms: durationMs,
        started_at: sourceStartedAt,
        finished_at: finishedAt,
        final_reason_code: status,
        final_error_summary: errorSummary,
      };
      return {
        sourceId: source.sourceId,
        universitySlug: source.universitySlug,
        universityId: source.universityId,
        collegeId: source.collegeId,
        departmentId: source.departmentId,
        sourceLevel: source.sourceLevel,
        collegeName: source.collegeName,
        sourceName: source.sourceName,
        adapterStrategy: getSourceAdapterStrategy(source),
        error: errorSummary || formatFetchError(error),
        detailItems: [],
        matched: [],
        executionResult,
      };
    }
  };
  telemetrySourcesQueued(pendingSources.length);
  const rawProcessed = await mapLimit(pendingSources, SOURCE_CONCURRENCY, async (source) => {
    const telemetrySource = telemetrySourceStarted();
    try {
      const result = await processSource(source);
      await checkpointSession?.recordSourceResult(result.executionResult);
      return result;
    } finally {
      telemetrySourceFinished(telemetrySource);
    }
  }, {
    signal,
    settleTimeoutMs: CLI_ARGUMENTS.settle_timeout_ms,
  });
  const processed = rawProcessed.map((result) => {
    if (!result?.__bounded_map_abandoned && !result?.__bounded_map_error) return result;
    const source = pendingSources[result.index] ?? {};
    const sourceId = cleanText(source.sourceId) || `unknown_source_${result.index ?? "map_error"}`;
    const sourceName = cleanText(source.sourceName) || sourceId;
    const isAbandoned = Boolean(result.__bounded_map_abandoned);
    const error = result.__bounded_map_error;
    const status = isAbandoned ? "partial" : classifyCrawlerFailure(error, "network_error");
    const errorSummary = isAbandoned
      ? "crawler_settle_timeout"
      : sanitizeCrawlerError(error) || "crawler_source_map_error";
    return {
      sourceId,
      universitySlug: source.universitySlug,
      universityId: source.universityId,
      collegeId: source.collegeId,
      departmentId: source.departmentId,
      sourceLevel: source.sourceLevel,
      collegeName: source.collegeName,
      sourceName,
      adapterStrategy: getSourceAdapterStrategy(source),
      error: errorSummary,
      detailItems: [],
      matched: [],
      executionResult: {
        source_key: sourceId,
        source_id: sourceId,
        source_name: sourceName,
        strategy: getSourceAdapterStrategy(source),
        result_status: status,
        cancelled: isAbandoned,
        observed_count: 0,
        notices: [],
        total_attempt_count: 1,
        attempt_history: [{
          sequence: 1,
          status,
          retryable: false,
          duration_ms: 0,
          reason_code: isAbandoned ? "crawler_settle_timeout" : status,
          timeout: status === "timeout",
          item_count: 0,
          error_summary: errorSummary,
          retry_delay_ms: 0,
        }],
        final_reason_code: isAbandoned ? "crawler_settle_timeout" : status,
        final_error_summary: errorSummary,
      },
    };
  });

  for (const result of processed) {
    if (result.error) {
      stats.push({
        sourceId: result.sourceId,
        universitySlug: result.universitySlug,
        universityId: result.universityId,
        collegeId: result.collegeId,
        departmentId: result.departmentId,
        sourceLevel: result.sourceLevel,
        collegeName: result.collegeName,
        sourceName: result.sourceName,
        adapterStrategy: result.adapterStrategy,
        crawledCount: 0,
        matchedCount: 0,
        newCount: 0,
        error: result.error,
        finalStatus: result.executionResult?.result_status ?? "network_error",
        attemptCount: result.executionResult?.total_attempt_count ?? 1,
        durationMs: result.executionResult?.duration_ms ?? 0,
        reasonCode: result.executionResult?.final_reason_code ?? "network_error",
      });
      console.log(`source=${result.sourceId} error=${result.error}`);
      continue;
    }

    const newlyDiscovered = IGNORE_SEEN
      ? result.matched
      : result.matched.filter((item) => !seen[item.noticeUrl]);
    if (!IGNORE_SEEN) {
      for (const notice of newlyDiscovered) {
        seen[notice.noticeUrl] = RUN_AT;
      }
    }

    crawled.push(...result.detailItems);
    allMatched.push(...result.matched);
    allNew.push(...newlyDiscovered);
    stats.push({
      sourceId: result.sourceId,
      universitySlug: result.universitySlug,
      universityId: result.universityId,
      collegeId: result.collegeId,
      departmentId: result.departmentId,
      sourceLevel: result.sourceLevel,
      collegeName: result.collegeName,
      sourceName: result.sourceName,
      adapterStrategy: result.adapterStrategy,
      crawledCount: result.detailItems.length,
      matchedCount: result.matched.length,
      newCount: newlyDiscovered.length,
      finalStatus: result.executionResult?.result_status ?? "success",
      attemptCount: result.executionResult?.total_attempt_count ?? 1,
      durationMs: result.executionResult?.duration_ms ?? 0,
      reasonCode: result.executionResult?.final_reason_code ?? "success",
    });
    console.log(
      `source=${result.sourceId} crawled=${result.detailItems.length} matched=${result.matched.length} new=${newlyDiscovered.length}`,
    );
  }

  const kstDate = formatKstDate();
  const resolvedOutputDir = path.resolve(OUTPUT_DIR);
  const resolvedStatePath = path.resolve(STATE_FILE_PATH);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  fs.mkdirSync(path.dirname(resolvedStatePath), { recursive: true });
  const runFinishedAt = new Date().toISOString();
  const executionResults = processed.map((result) => result.executionResult);
  const executionSummary = buildCrawlerRunSummary(executionResults, {
    run_id: `crawl-notices-${RUN_AT}`,
    runner_version: "engine-phase-2-common-runner-v1",
    started_at: RUN_AT,
    finished_at: runFinishedAt,
  });
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const sourceRegistryDiagnostics = buildSourceRegistryDiagnostics(sources);
  const candidateDetectionDiagnostics = buildCandidateDetectionDiagnostics(processed);
  const operationalDiagnostics = buildOperationalCrawlDiagnostics({
    sources: processed.map((result) => ({
      source: sourceById.get(result.sourceId) ?? {
        sourceId: result.sourceId,
        sourceName: result.sourceName,
      },
      executionResult: result.executionResult,
      notices: result.detailItems,
      matchedCount: result.matched.length,
      filterMetrics: result.filterMetrics,
      candidateDetection: candidateDetectionDiagnostics.sources.find((row) =>
        row.source_id === result.sourceId) ?? null,
    })),
  });
  const cancelled = signal?.aborted === true;
  const cancellationReason = cancelled ? cleanText(signal.reason) || "crawler_cancelled" : null;
  const checkpointCancellation = cancelled && checkpointSession
    ? await checkpointSession.markCancelled(
        cancellationReason,
        pendingSources
          .filter((source) => !checkpointSession.shouldSkipSource(source.sourceId))
          .map((source) => ({ source_key: source.sourceId, reason_code: cancellationReason })),
      )
    : null;
  if (!cancelled && checkpointSession) await checkpointSession.markCompleted();
  await checkpointSession?.flush();
  const checkpointSnapshot = checkpointSession?.snapshot() ?? null;

  const report = buildCrawlerReport({
    runAt: RUN_AT,
    inputLabel: loaded.inputLabel,
    sourceMode: loaded.mode,
    databaseReadPerformed: loaded.mode === "db",
    totals: {
      sourceCount: sources.length,
      crawledCount: crawled.length,
      matchedCount: allMatched.length,
      newCount: allNew.length,
      knownCount: Object.keys(seen).length,
      lookbackDays: LOOKBACK_DAYS,
      allowUndated: ALLOW_UNDATED,
      sourceConcurrency: SOURCE_CONCURRENCY,
      detailConcurrency: DETAIL_CONCURRENCY,
      hostConcurrency: HOST_CONCURRENCY,
      sourceMinimumIntervalMs: SOURCE_MIN_INTERVAL_MS,
      hostMinimumIntervalMs: HOST_MIN_INTERVAL_MS,
      ignoreSeen: IGNORE_SEEN,
      maxItemsPerSource: MAX_ITEMS_PER_SOURCE,
      maxPagesPerSource: MAX_PAGES_PER_SOURCE,
      documentParsingEnabled: documentRuntime.enabled,
      documentCacheDirectory: documentRuntime.enabled ? ".tmp/engine-phase-3/cache" : null,
      timeoutMs: REQUEST_TIMEOUT_MS,
      sourceExecutionIsolationEnabled: SOURCE_EXECUTION_ISOLATION_ENABLED,
      sourceExecutionTimeoutMs: SOURCE_EXECUTION_TIMEOUT_MS,
      retryCount: REQUEST_RETRY_COUNT,
      retryBackoffMs: REQUEST_RETRY_BACKOFF_MS,
      retryMaximumDelayMs: REQUEST_RETRY_MAX_DELAY_MS,
      retryJitterRatio: REQUEST_RETRY_JITTER_RATIO,
      sourceLevelFilterCount: SOURCE_LEVEL_ALLOWLIST.size > 0 ? SOURCE_LEVEL_ALLOWLIST.size : "all",
      collegeFilterCount: COLLEGE_NAME_ALLOWLIST.size > 0 ? COLLEGE_NAME_ALLOWLIST.size : "all",
    },
    executionSummary,
    executionResults,
    operationalDiagnostics,
    candidateDetection: candidateDetectionDiagnostics,
    sourceRegistryDiagnostics,
    recovery: checkpointSession ? {
      status: checkpointSnapshot.status,
      cancelled,
      cancellationReason,
      checkpointPath: checkpointSession.checkpoint_path,
      checkpointSaved: checkpointCancellation?.checkpoint_saved ?? true,
      checkpointSaveError: checkpointCancellation?.checkpoint_save_error ?? null,
      resumed: checkpointSession.resumed,
      runIdentity: checkpointSession.run_identity,
      completedSourceCount: checkpointSnapshot.completed_source_keys.length,
      completedWorkItemCount: checkpointSnapshot.completed_work_item_keys.length,
      skippedSourceCount: sources.length - pendingSources.length,
      pendingSourceCount: Math.max(0, sources.length - checkpointSnapshot.completed_source_keys.length),
    } : null,
    stats,
    crawled,
    allMatched,
    allNew,
    documentParsingEnabled: documentRuntime.enabled,
    summarizeDocumentEvidence: summarizeNoticeDocumentEvidence,
  });

  const jsonPath = path.join(resolvedOutputDir, `scholarship-notices-${kstDate}.json`);
  const latestJsonPath = path.join(resolvedOutputDir, "scholarship-notices-latest.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2), "utf8");

  const csvPath = path.join(resolvedOutputDir, `scholarship-notices-new-${kstDate}.csv`);
  fs.writeFileSync(csvPath, buildCrawlerNoticeCsv({ runAt: RUN_AT, notices: allNew }), "utf8");
  const operationalDiagnosticsCsv = buildOperationalCrawlDiagnosticsCsv(operationalDiagnostics);
  fs.writeFileSync(
    path.join(resolvedOutputDir, `crawler-operational-diagnostics-${kstDate}.csv`),
    operationalDiagnosticsCsv,
    "utf8",
  );
  fs.writeFileSync(
    path.join(resolvedOutputDir, "crawler-operational-diagnostics-latest.csv"),
    operationalDiagnosticsCsv,
    "utf8",
  );

  fs.writeFileSync(
    resolvedStatePath,
    JSON.stringify(
      {
        updatedAt: RUN_AT,
        seen,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`sources=${sources.length}`);
  console.log(`crawled=${crawled.length}`);
  console.log(`matched=${allMatched.length}`);
  console.log(`new=${allNew.length}`);
  console.log(`source_prefix=${SOURCE_ID_PREFIX || "all"}`);
  console.log(
    `source_allowlist_count=${SOURCE_ID_ALLOWLIST.size > 0 ? SOURCE_ID_ALLOWLIST.size : "all"}`,
  );
  console.log(
    `source_level_filter=${SOURCE_LEVEL_ALLOWLIST.size > 0 ? [...SOURCE_LEVEL_ALLOWLIST].join("|") : "all"}`,
  );
  console.log(
    `college_name_filter=${COLLEGE_NAME_ALLOWLIST.size > 0 ? [...COLLEGE_NAME_ALLOWLIST].join("|") : "all"}`,
  );
  console.log("tls_verification=required");
  console.log(`json=${jsonPath}`);
  console.log(`csv=${csvPath}`);
  console.log(`state=${resolvedStatePath}`);
  if (checkpointSession) {
    console.log(`checkpoint=${checkpointSession.checkpoint_path}`);
    console.log(`checkpoint_status=${checkpointSnapshot.status}`);
    console.log(`resume=${checkpointSession.resumed}`);
  }
  return { cancelled, report };
}

if (IS_MAIN) {
  let telemetrySession = null;
  try {
    telemetrySession = startCrawlerPerformanceTelemetry({
      outputDirectory: OUTPUT_DIR,
      universityGroup: process.env.CRAWLER_UNIVERSITY_GROUP ?? INPUT_ARG.replace(/^db:/, ""),
      sourceConcurrency: SOURCE_CONCURRENCY,
      detailConcurrency: DETAIL_CONCURRENCY,
      hostConcurrency: HOST_CONCURRENCY,
      timeoutMs: REQUEST_TIMEOUT_MS,
      retryCount: REQUEST_RETRY_COUNT,
      retryBackoffMs: REQUEST_RETRY_BACKOFF_MS,
      retryMaximumDelayMs: REQUEST_RETRY_MAX_DELAY_MS,
      retryJitterRatio: REQUEST_RETRY_JITTER_RATIO,
      lookbackDays: LOOKBACK_DAYS,
      allowUndated: ALLOW_UNDATED,
      ignoreSeen: IGNORE_SEEN,
      documentParsingEnabled: DOCUMENT_PARSING_ENABLED,
    });
  } catch (error) {
    console.error(`crawler_telemetry_start_warning=${sanitizeCrawlerError(error)}`);
  }
  const finishTelemetrySafely = async (input) => {
    if (!telemetrySession) return;
    try {
      await finishCrawlerPerformanceTelemetry(input);
    } catch (error) {
      console.error(`crawler_telemetry_finish_warning=${sanitizeCrawlerError(error)}`);
    }
  };
  const controller = new AbortController();
  const signalHandlers = installCrawlerSignalHandlers({
    controller,
    onSecondSignal: ({ second_signal: secondSignal }) => {
      console.error(`crawler_force_exit_requested=${secondSignal}`);
    },
  });
  run({ signal: controller.signal })
    .then(async (result) => {
      // Lingering keep-alive sockets (undici/insecure-TLS dispatcher) can keep
      // the event loop alive well after all work is done, especially on
      // Windows. Force an explicit exit once results are written so the
      // process (and any CI job wrapping it) doesn't hang.
      signalHandlers.dispose();
      await finishTelemetrySafely({ crawlerResult: result });
      process.exit(result.cancelled ? 130 : 0);
    })
    .catch(async (error) => {
      console.error(error);
      signalHandlers.dispose();
      await finishTelemetrySafely({ error });
      process.exit(1);
    });
}
