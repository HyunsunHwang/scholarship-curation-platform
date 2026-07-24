import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread } from "node:worker_threads";
import {
  buildBoundedPaginationUrls,
  getAdapterCapabilityEvidence,
  getListAdapter,
  getSourceAdapterStrategy,
} from "../lib/crawler-adapters/index.mjs";
import { loadSources } from "../lib/notice-sources-loader.mjs";
import {
  DEFAULT_CRAWLER_RETRY_BACKOFF_MS,
  runBoundedCrawlerSource,
} from "../lib/crawler-engine/common-runner.mjs";
import {
  buildResolvedTransportPolicyEvidence,
  createTransportClient,
  createTransportDispatcherPool,
  loadTransportPolicyRegistry,
  parseTransportRuntimeOverrides,
  resolveEffectiveTransportPolicy,
  resolveTransportPoliciesForSources,
  sanitizeTransportUrl,
} from "../lib/crawler-engine/transport/index.mjs";
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
import { extractFromList } from "../lib/crawler-engine/crawler-list-parser.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import { createListAdapterExecution } from "../lib/crawler-engine/list-adapter-strategy.mjs";
import { boundedMap, createCrawlerRateLimiter } from "../lib/crawler-engine/execution-policy.mjs";
import {
  finishCrawlerPerformanceTelemetry,
  applyCrawlerTelemetryEvent,
  isCrawlerPerformanceTelemetryActive,
  releaseCrawlerTelemetryWorker,
  startCrawlerPerformanceTelemetry,
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
import { buildSourceRegistryDiagnostics } from "../lib/crawler-engine/source-registry-diagnostics.mjs";
import {
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
const TRANSPORT_RUNTIME_OVERRIDES = parseTransportRuntimeOverrides(process.env);
const SOURCE_EXECUTION_TIMEOUT_INPUT = Number(
  process.env.CRAWL_SOURCE_EXECUTION_TIMEOUT_MS ?? 180_000,
);
const SOURCE_EXECUTION_TIMEOUT_MS = Number.isFinite(SOURCE_EXECUTION_TIMEOUT_INPUT)
  ? Math.max(25_000, SOURCE_EXECUTION_TIMEOUT_INPUT)
  : 180_000;
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
// Compatibility exports retained for older tests and operational callers.
// Production dispatchers are created only by the transport policy layer.
export function parseInsecureTlsHostAllowlist(value) {
  return new Set(
    String(value ?? "")
      .split(/[\s,|]+/)
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function shouldAllowInsecureTls(url, insecureTlsHosts) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && insecureTlsHosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const MODULE_TRANSPORT_DISPATCHER_POOL = createTransportDispatcherPool();
let standaloneTransportRegistry = null;
const RUN_AT = new Date().toISOString();

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function loadTransportPolicyValidationInventory(
  configuredSources,
  { loadSourcesImpl = loadSources, sourceMode = "manifest" } = {},
) {
  const inventoryMode = sourceMode === "db" ? "db" : "manifest";
  const completeInventory = await loadSourcesImpl(inventoryMode, { includeDisabled: true });
  const bySourceId = new Map(
    completeInventory.sources.map((source) => [source.sourceId, source]),
  );
  // Preserve a complete inventory so policy bindings outside the selected
  // university remain known. Manual DB rollback validates against a full
  // read-only DB inventory and therefore does not depend on manifest health.
  for (const source of configuredSources ?? []) bySourceId.set(source.sourceId, source);
  return [...bySourceId.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId));
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

function createStandaloneTransportClient(url, { fetchImpl } = {}) {
  standaloneTransportRegistry ??= loadTransportPolicyRegistry();
  const source = {
    sourceId: "standalone_transport",
    universitySlug: "standalone",
    listUrl: url,
  };
  const transportPolicy = resolveEffectiveTransportPolicy({
    source,
    registry: standaloneTransportRegistry,
    runtimeOverrides: {
      ...TRANSPORT_RUNTIME_OVERRIDES,
      deprecatedInsecureTlsHosts: [],
    },
  });
  return createTransportClient({
    source,
    policy: transportPolicy,
    dispatcherPool: MODULE_TRANSPORT_DISPATCHER_POOL,
    fallbackCharset: FALLBACK_CHARSET,
    fetchImpl,
  });
}

export async function fetchUrlWithMetadata(url, options = {}) {
  const {
    transportClient: providedTransportClient,
    fetchImpl,
    ...requestOptions
  } = options;
  const transportClient = providedTransportClient
    ?? createStandaloneTransportClient(url, { fetchImpl });
  return transportClient.request(url, requestOptions);
}

export async function fetchHtmlWithMetadata(url, options = {}) {
  const {
    transportClient: providedTransportClient,
    fetchImpl,
    ...requestOptions
  } = options;
  const transportClient = providedTransportClient
    ?? createStandaloneTransportClient(url, { fetchImpl });
  return transportClient.fetchHtml(url, {
    ...requestOptions,
    maxBytes: requestOptions.maxBytes ?? DOCUMENT_MAX_BYTES,
  });
}

export async function fetchHtml(url, options = {}) {
  return (await fetchHtmlWithMetadata(url, options)).html;
}

export async function inspectCrawlerAsset(asset, context = {}) {
  const response = await fetchUrlWithMetadata(asset.url, {
    transportClient: context.transportClient,
    method: "HEAD",
    readBody: false,
    retryCount: 0,
    timeoutMs: context.timeoutMs,
    maxBytes: context.maxBytes ?? DOCUMENT_MAX_BYTES,
  });
  return {
    finalUrl: sanitizeTransportUrl(response.finalUrl),
    mimeType: response.contentType.split(";")[0],
    etag: response.etag,
    lastModified: response.lastModified,
    contentLength: response.contentLength,
  };
}

export async function fetchCrawlerAsset(asset, context = {}) {
  const response = await fetchUrlWithMetadata(asset.url, {
    transportClient: context.transportClient,
    method: "GET",
    retryCount: 0,
    timeoutMs: context.timeoutMs,
    maxBytes: context.maxBytes ?? DOCUMENT_MAX_BYTES,
  });
  return {
    bytes: response.bytes,
    finalUrl: sanitizeTransportUrl(response.finalUrl),
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
    try {
      return await transport(asset, {
        ...context,
        transportClient: context.transportClient ?? options.transportClient,
      });
    } finally {
      permit?.release();
    }
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

export { extractFromList };

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

export function buildSourceExecutionTimeoutResult(
  source,
  startedAt,
  startedMs,
  stageEvents,
  transportPolicy = null,
) {
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
    retry_backoff_ms:
      transportPolicy?.retry?.baseDelayMs
      ?? DEFAULT_CRAWLER_RETRY_BACKOFF_MS,
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
    transport_evidence: transportPolicy
      ? {
          ...buildResolvedTransportPolicyEvidence(transportPolicy),
          request_attempt_count: null,
          request_retry_count: null,
          redirect_hop_count: null,
          redirect_chain: [],
          final_url: null,
          insecure_tls_applied: null,
          request_attempt_history: [],
        }
      : null,
    execution_stage_evidence: {
      source_execution_timeout_ms: SOURCE_EXECUTION_TIMEOUT_MS,
      timed_out: true,
      last_observed_stage: stageEvents.at(-1)?.stage ?? null,
      stage_events: stageEvents,
    },
  };
}

export function buildSourceExecutionErrorResult(
  source,
  startedAt,
  startedMs,
  stageEvents,
  safeError,
  transportPolicy = null,
) {
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
    retry_backoff_ms:
      transportPolicy?.retry?.baseDelayMs
      ?? DEFAULT_CRAWLER_RETRY_BACKOFF_MS,
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
    transport_evidence: safeError?.transport_evidence ?? null,
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
  transportPolicy,
}) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const stageEvents = [];
  const workerId = `${source.sourceId}:${randomUUID()}`;
  const worker = new Worker(new URL("../lib/crawler-engine/source-execution-worker.mjs", import.meta.url), {
    workerData: {
      workerId,
      source,
      transportPolicy,
      inventoryRows,
      completedWorkItemKeys,
      config: {
        lookbackDays: LOOKBACK_DAYS,
        allowUndated: ALLOW_UNDATED,
        maxItems: MAX_ITEMS_PER_SOURCE,
        maxPages: MAX_PAGES_PER_SOURCE,
        fetchDetails: DETAIL_FETCH_ENABLED,
        timeoutMs: transportPolicy.timeoutMs,
        retryCount: transportPolicy.retry.count,
        retryBackoffMs: transportPolicy.retry.baseDelayMs,
        retryMaximumDelayMs: transportPolicy.retry.maximumDelayMs,
        retryJitterRatio: transportPolicy.retry.jitterRatio,
        detailConcurrency: DETAIL_CONCURRENCY,
        documentParsingEnabled: DOCUMENT_PARSING_ENABLED,
        documentCacheDirectory: DOCUMENT_CACHE_DIRECTORY,
        documentMaxBytes: DOCUMENT_MAX_BYTES,
        documentMaxPages: DOCUMENT_MAX_PAGES,
        documentMaxOcrPages: DOCUMENT_MAX_OCR_PAGES,
        documentOcrTimeoutMs: DOCUMENT_OCR_TIMEOUT_MS,
        fallbackCharset: FALLBACK_CHARSET,
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
        executionResult: buildSourceExecutionTimeoutResult(
          source,
          startedAt,
          startedMs,
          stageEvents,
          transportPolicy,
        ),
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
          detail_url: cleanText(sanitizeTransportUrl(message.detail_url)) || null,
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
            transportPolicy,
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

async function run({ signal, onTransportResolved } = {}) {
  const loaded = await loadSources(INPUT_ARG);
  const configuredSources = loaded.sources;
  const transportPolicyValidationInventory =
    await loadTransportPolicyValidationInventory(configuredSources, {
      sourceMode: loaded.mode,
    });
  const transportRegistry = loadTransportPolicyRegistry({
    sources: transportPolicyValidationInventory,
    now: new Date(RUN_AT),
  });
  const transportPolicies = resolveTransportPoliciesForSources({
    sources: configuredSources,
    registry: transportRegistry,
    runtimeOverrides: TRANSPORT_RUNTIME_OVERRIDES,
    now: new Date(RUN_AT),
  });
  if (TRANSPORT_RUNTIME_OVERRIDES.deprecatedInsecureTlsHosts.length > 0) {
    console.warn(
      "warning=CRAWL_ALLOW_INSECURE_TLS_HOSTS is deprecated; exact hosts were authorized by the transport registry",
    );
  }
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
  const selectedTransportPolicies = sources.map((source) => {
    const policy = transportPolicies.get(source.sourceId);
    if (!policy) throw new Error(`Missing resolved transport policy: ${source.sourceId}`);
    return policy;
  });
  const resolvedTransportPolicyFingerprints = Object.fromEntries(
    sources
      .map((source) => [
        source.sourceId,
        transportPolicies.get(source.sourceId).policyFingerprint,
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const maximumTransportValue = (selector) =>
    Math.max(...selectedTransportPolicies.map(selector));
  await onTransportResolved?.({
    transportRegistry,
    selectedTransportPolicies,
    sourceCount: sources.length,
  });
  const requestLimiter = createCrawlerRateLimiter({
    minimumSourceIntervalMs: SOURCE_MIN_INTERVAL_MS,
    minimumHostIntervalMs: HOST_MIN_INTERVAL_MS,
    maximumHostConcurrency: HOST_CONCURRENCY,
  });
  const checkpointSession = await createCrawlerCheckpointSession({
    checkpointPath: CLI_ARGUMENTS.checkpoint_path,
    resume: CLI_ARGUMENTS.resume,
    runIdentity: CLI_ARGUMENTS.run_identity ?? (CLI_ARGUMENTS.resume ? undefined : `crawl-notices-${RUN_AT}`),
    sourceKeys: sources.map((source) => source.sourceId),
    configuration: {
      runner_contract_version: "engine-phase-2-common-runner-v1",
      source_concurrency: SOURCE_CONCURRENCY,
      detail_concurrency: DETAIL_CONCURRENCY,
      retry_count: maximumTransportValue((policy) => policy.retry.count),
      retry_backoff_ms: maximumTransportValue((policy) => policy.retry.baseDelayMs),
      retry_maximum_delay_ms: maximumTransportValue(
        (policy) => policy.retry.maximumDelayMs,
      ),
      retry_jitter_ratio: maximumTransportValue((policy) => policy.retry.jitterRatio),
      timeout_ms: maximumTransportValue((policy) => policy.timeoutMs),
      transport_policy_schema_version: transportRegistry.schemaVersion,
      transport_policy_registry_version: transportRegistry.registryVersion,
      transport_policy_registry_fingerprint: transportRegistry.registryFingerprint,
      resolved_transport_policy_fingerprints: resolvedTransportPolicyFingerprints,
      runtime_transport_overrides: TRANSPORT_RUNTIME_OVERRIDES.evidence,
      source_execution_isolation_enabled: SOURCE_EXECUTION_ISOLATION_ENABLED,
      source_execution_mode: SOURCE_EXECUTION_MODE.mode,
      source_execution_timeout_ms: SOURCE_EXECUTION_TIMEOUT_MS,
      source_minimum_interval_ms: SOURCE_MIN_INTERVAL_MS,
      host_minimum_interval_ms: HOST_MIN_INTERVAL_MS,
      host_concurrency: HOST_CONCURRENCY,
      fetch_details: DETAIL_FETCH_ENABLED,
      document_parsing_enabled: DOCUMENT_PARSING_ENABLED,
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
    const transportPolicy = transportPolicies.get(source.sourceId);
    const transportClient = SOURCE_EXECUTION_ISOLATION_ENABLED
      ? null
      : createTransportClient({
          source,
          policy: transportPolicy,
          dispatcherPool: MODULE_TRANSPORT_DISPATCHER_POOL,
          requestLimiter,
          fallbackCharset: FALLBACK_CHARSET,
        });
    const documentRuntime = SOURCE_EXECUTION_ISOLATION_ENABLED
      ? null
      : createAuthoritativeDocumentRuntime({ transportClient });
    const sourceExecutionContext = Object.freeze({
      source,
      transportPolicy,
      transportClient,
    });
    let executionResult = null;
    try {
      const workerResult = SOURCE_EXECUTION_ISOLATION_ENABLED
        ? await executeSourceInWorker({
          source,
          inventoryRows,
          completedWorkItemKeys: checkpointSession?.snapshot().completed_work_item_keys ?? [],
          checkpointSession,
          seenNoticeUrls: Object.keys(seen),
          transportPolicy,
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
        const listAdapter = getListAdapter(source.adapter, source);
        const commonOptions = {
          source,
          inventoryRows,
          maxItems: MAX_ITEMS_PER_SOURCE,
          timeoutMs: transportPolicy.timeoutMs,
          retryCount: transportPolicy.retry.count,
          retryBackoffMs: transportPolicy.retry.baseDelayMs,
          maximumRetryDelayMs: transportPolicy.retry.maximumDelayMs,
          retryJitterRatio: transportPolicy.retry.jitterRatio,
          detailConcurrency: DETAIL_CONCURRENCY,
          requestLimiter: null,
          completedWorkItemKeys:
            checkpointSession?.snapshot().completed_work_item_keys ?? [],
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
        };
        let commonResult;
        if (listAdapter) {
          const adapterExecution = createListAdapterExecution({
            source,
            listAdapter,
            transportClient,
            strategyName: getSourceAdapterStrategy(source),
            adapterOptions: {
              transportPolicy: sourceExecutionContext.transportPolicy,
              lookbackDays: LOOKBACK_DAYS,
              allowUndated: ALLOW_UNDATED,
              maxItems: MAX_ITEMS_PER_SOURCE,
            },
          });
          commonResult = await runBoundedCrawlerSource({
            ...commonOptions,
            strategy: adapterExecution.strategy,
            fetchHtml: adapterExecution.fetchHtml,
            listUrls: [source.listUrl],
            fetchDetails: false,
          });
          commonResult.adapter_evidence = getAdapterCapabilityEvidence(
            source.adapter,
            source,
            commonResult,
          );
        } else {
          const transportFetchHtml = async (url, request = {}) => (
            await transportClient.fetchHtml(url, {
              ...request,
              retryCount: 0,
            })
          ).html;
          commonResult = await runBoundedCrawlerSource({
            ...commonOptions,
            strategy: genericHtmlStrategy,
            fetchHtml: transportFetchHtml,
            listUrls: buildBoundedPaginationUrls(source, MAX_PAGES_PER_SOURCE),
            fetchDetails: DETAIL_FETCH_ENABLED,
          });
        }
        executionResult = {
          ...commonResult,
          transport_evidence: transportClient.evidence(),
        };
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
        detailItems = commonResult.notices;
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
          authoritative_content_available_count:
            executionResult?.candidate_detection?.authoritative_content_available_count ?? 0,
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
        retry_backoff_ms: transportPolicy.retry.baseDelayMs,
        total_retry_delay_ms: 0,
        retried: false,
        recovered_after_retry: false,
        retry_exhausted: false,
        duration_ms: durationMs,
        started_at: sourceStartedAt,
        finished_at: finishedAt,
        final_reason_code: status,
        final_error_summary: errorSummary,
        transport_evidence:
          transportClient?.evidence()
          ?? error?.transport_evidence
          ?? null,
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
    sourceRegistry: loaded.sourceRegistry ?? null,
    transportPolicyRegistry: {
      schema_version: transportRegistry.schemaVersion,
      registry_version: transportRegistry.registryVersion,
      registry_fingerprint: transportRegistry.registryFingerprint,
      resolved_source_count: transportPolicies.size,
      resolved_policy_fingerprints: resolvedTransportPolicyFingerprints,
      runtime_overrides: TRANSPORT_RUNTIME_OVERRIDES.evidence,
    },
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
      documentParsingEnabled: DOCUMENT_PARSING_ENABLED,
      documentCacheDirectory: DOCUMENT_PARSING_ENABLED
        ? DOCUMENT_CACHE_DIRECTORY
        : null,
      timeoutMs: maximumTransportValue((policy) => policy.timeoutMs),
      sourceExecutionIsolationEnabled: SOURCE_EXECUTION_ISOLATION_ENABLED,
      sourceExecutionTimeoutMs: SOURCE_EXECUTION_TIMEOUT_MS,
      retryCount: maximumTransportValue((policy) => policy.retry.count),
      retryBackoffMs: maximumTransportValue((policy) => policy.retry.baseDelayMs),
      retryMaximumDelayMs: maximumTransportValue(
        (policy) => policy.retry.maximumDelayMs,
      ),
      retryJitterRatio: maximumTransportValue((policy) => policy.retry.jitterRatio),
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
    documentParsingEnabled: DOCUMENT_PARSING_ENABLED,
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
  console.log("tls_verification=transport_policy_registry");
  console.log(
    `tls_insecure_exact_host_source_count=${
      selectedTransportPolicies.filter((policy) =>
        policy.tlsMode === "insecure-exact-host").length
    }`,
  );
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
  const startTelemetrySafely = ({ selectedTransportPolicies }) => {
    if (telemetrySession) return;
    const maximum = (selector) =>
      Math.max(...selectedTransportPolicies.map(selector));
    try {
      telemetrySession = startCrawlerPerformanceTelemetry({
        outputDirectory: OUTPUT_DIR,
        universityGroup:
          process.env.CRAWLER_UNIVERSITY_GROUP
          ?? INPUT_ARG.replace(/^(?:db|manifest):/, ""),
        sourceConcurrency: SOURCE_CONCURRENCY,
        detailConcurrency: DETAIL_CONCURRENCY,
        hostConcurrency: HOST_CONCURRENCY,
        timeoutMs: maximum((policy) => policy.timeoutMs),
        retryCount: maximum((policy) => policy.retry.count),
        retryBackoffMs: maximum((policy) => policy.retry.baseDelayMs),
        retryMaximumDelayMs: maximum((policy) => policy.retry.maximumDelayMs),
        retryJitterRatio: maximum((policy) => policy.retry.jitterRatio),
        lookbackDays: LOOKBACK_DAYS,
        allowUndated: ALLOW_UNDATED,
        ignoreSeen: IGNORE_SEEN,
        documentParsingEnabled: DOCUMENT_PARSING_ENABLED,
      });
    } catch (error) {
      console.error(`crawler_telemetry_start_warning=${sanitizeCrawlerError(error)}`);
    }
  };
  const finishTelemetrySafely = async (input) => {
    if (!telemetrySession) return;
    try {
      await finishCrawlerPerformanceTelemetry(input);
    } catch (error) {
      console.error(`crawler_telemetry_finish_warning=${sanitizeCrawlerError(error)}`);
    }
  };
  const closeTransportSafely = async () => {
    try {
      await MODULE_TRANSPORT_DISPATCHER_POOL.close();
    } catch (error) {
      console.error(`crawler_transport_close_warning=${sanitizeCrawlerError(error)}`);
    }
  };
  const controller = new AbortController();
  const signalHandlers = installCrawlerSignalHandlers({
    controller,
    onSecondSignal: ({ second_signal: secondSignal }) => {
      console.error(`crawler_force_exit_requested=${secondSignal}`);
    },
  });
  run({
    signal: controller.signal,
    onTransportResolved: startTelemetrySafely,
  })
    .then(async (result) => {
      // Lingering keep-alive sockets (undici/insecure-TLS dispatcher) can keep
      // the event loop alive well after all work is done, especially on
      // Windows. Force an explicit exit once results are written so the
      // process (and any CI job wrapping it) doesn't hang.
      signalHandlers.dispose();
      await finishTelemetrySafely({ crawlerResult: result });
      await closeTransportSafely();
      process.exit(result.cancelled ? 130 : 0);
    })
    .catch(async (error) => {
      console.error(error);
      signalHandlers.dispose();
      await finishTelemetrySafely({ error });
      await closeTransportSafely();
      process.exit(1);
    });
}
