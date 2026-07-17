import { resolveExactSourceKey } from "../post-phase-l/source-resolver.mjs";
import {
  abortableDelay,
  boundedMap,
  crawlerCancellationError,
  createCrawlerRateLimiter,
  isCrawlerCancellation,
  normalizeConcurrency,
  selectRetryDelay,
} from "./execution-policy.mjs";

export const DEFAULT_CRAWLER_TIMEOUT_MS = 25_000;
export const DEFAULT_CRAWLER_RETRY_COUNT = 1;
export const MAX_CRAWLER_RETRY_COUNT = 3;
export const DEFAULT_CRAWLER_RETRY_BACKOFF_MS = 1_000;
export const MAX_CRAWLER_RETRY_BACKOFF_MS = 30_000;
export const DEFAULT_CRAWLER_RETRY_JITTER_RATIO = 0;

export const CRAWLER_RESULT_STATUSES = Object.freeze([
  "success",
  "empty_observed",
  "partial",
  "timeout",
  "network_error",
  "http_error",
  "parser_error",
  "configuration_error",
  "source_resolution_error",
  "unsupported",
]);

const SUCCESS_STATUSES = new Set(["success"]);
const ZERO_MATCH_STATUSES = new Set(["empty_observed"]);
const PARTIAL_STATUSES = new Set(["partial"]);
const BLOCKED_STATUSES = new Set([
  "configuration_error",
  "source_resolution_error",
  "unsupported",
]);

function clean(value) {
  return String(value ?? "").trim();
}

export function sanitizeCrawlerError(value) {
  let message = clean(value?.message ?? value);
  message = message
    .replace(/(authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/(password|passwd|secret|token|api[_-]?key|anon[_-]?key|service[_-]?role[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@")
    .replace(/eyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){0,2}/g, "[REDACTED_JWT]");
  return message.slice(0, 300);
}

function configurationError(source, reason) {
  return {
    source_key: clean(source?.sourceKey ?? source?.sourceId),
    source_id: null,
    result_status: "configuration_error",
    observed_count: 0,
    matched_count: 0,
    error_code: reason,
    error_message: reason,
    timeout: false,
    notices: [],
  };
}

export function validateCommonCrawlerSource(source) {
  const sourceKey = clean(source?.sourceKey ?? source?.sourceId);
  if (!sourceKey) return "missing_source_key";
  if (!clean(source?.sourceName)) return "missing_source_name";
  try {
    const listUrl = new URL(clean(source?.listUrl));
    if (!["http:", "https:"].includes(listUrl.protocol)) return "unsupported_list_url_protocol";
  } catch {
    return "invalid_list_url";
  }
  return "";
}

export function classifyCrawlerFailure(error, fallback = "network_error") {
  if (error?.crawlerStatus && CRAWLER_RESULT_STATUSES.includes(error.crawlerStatus)) {
    return error.crawlerStatus;
  }
  if (isCrawlerCancellation(error)) return "partial";
  if (error?.name === "AbortError" || error?.code === "attempt_timeout") return "timeout";
  if (Number.isFinite(Number(error?.httpStatus))) return "http_error";
  return fallback;
}

function failureResult(sourceKey, sourceId, status, error) {
  const message = sanitizeCrawlerError(error) || status;
  return {
    source_key: sourceKey,
    source_id: sourceId,
    result_status: status,
    observed_count: 0,
    matched_count: 0,
    error_code: clean(error?.code) || status,
    error_message: message,
    http_status: Number.isFinite(Number(error?.httpStatus)) ? Number(error.httpStatus) : null,
    retry_after: clean(error?.retryAfter) || null,
    timeout: status === "timeout",
    cancelled: isCrawlerCancellation(error),
    notices: [],
  };
}

function responseHtml(response) {
  return typeof response === "string" ? response : String(response?.html ?? "");
}

export async function runCommonCrawlerSource({
  source,
  inventoryRows,
  strategy,
  fetchHtml,
  listUrls,
  maxItems = 20,
  fetchDetails = true,
  beforeDetail,
  processNoticeDocuments,
  detailConcurrency = 1,
  requestLimiter = null,
  signal,
}) {
  const invalidReason = validateCommonCrawlerSource(source);
  if (invalidReason) return configurationError(source, invalidReason);

  const sourceKey = clean(source.sourceKey ?? source.sourceId);
  const resolution = resolveExactSourceKey(sourceKey, inventoryRows);
  if (resolution.blocked) {
    return failureResult(sourceKey, null, "source_resolution_error", {
      code: resolution.reason,
      message: resolution.reason,
    });
  }

  const sourceId = resolution.source_id;
  if (!strategy || typeof strategy.parseList !== "function") {
    return failureResult(sourceKey, sourceId, "unsupported", {
      code: "missing_supported_strategy",
      message: "No supported crawler strategy is configured.",
    });
  }
  if (typeof fetchHtml !== "function") {
    return configurationError(source, "missing_fetch_html_transport");
  }

  const boundedLimit = Math.max(1, Number(maxItems) || 1);
  const boundedDetailConcurrency = normalizeConcurrency(detailConcurrency);
  const urls = Array.isArray(listUrls) && listUrls.length > 0 ? listUrls : [source.listUrl];
  const items = [];
  const seen = new Set();
  const controlledFetch = async (url, request = {}) => {
    if (signal?.aborted) throw crawlerCancellationError();
    const permit = requestLimiter
      ? await requestLimiter.acquire({ url, sourceKey, signal })
      : null;
    try {
      return await fetchHtml(url, { ...request, signal: request.signal ?? signal });
    } finally {
      permit?.release();
    }
  };

  for (const listUrl of urls) {
    let html;
    try {
      const request = strategy.buildListRequest
        ? strategy.buildListRequest({ source, listUrl })
        : { url: listUrl };
      html = responseHtml(await controlledFetch(request.url, request));
    } catch (error) {
      return failureResult(
        sourceKey,
        sourceId,
        classifyCrawlerFailure(error, "network_error"),
        error,
      );
    }

    let parsed;
    try {
      parsed = await strategy.parseList({ source: { ...source, listUrl }, html });
      if (!Array.isArray(parsed)) throw new Error("Strategy parseList must return an array.");
    } catch (error) {
      return failureResult(sourceKey, sourceId, "parser_error", error);
    }

    for (const item of parsed) {
      const detailUrl = strategy.resolveDetailUrl
        ? strategy.resolveDetailUrl({ source, item })
        : item.noticeUrl;
      if (!detailUrl || seen.has(detailUrl)) continue;
      seen.add(detailUrl);
      items.push({ ...item, noticeUrl: detailUrl });
      if (items.length >= boundedLimit) break;
    }
    if (items.length >= boundedLimit) break;
  }

  const itemResults = await boundedMap(items, boundedDetailConcurrency, async (item) => {
    let detail = {};
    let detailHtml = "";
    if (fetchDetails && item.noticeUrl) {
      try {
        if (beforeDetail) await beforeDetail({ source, item, signal });
        const request = strategy.buildDetailRequest
          ? strategy.buildDetailRequest({ source, item })
          : { url: item.noticeUrl };
        detailHtml = responseHtml(await controlledFetch(request.url, request));
      } catch (error) {
        detail = {
          detailFetchError: sanitizeCrawlerError(error),
          detailResultStatus: classifyCrawlerFailure(error, "network_error"),
        };
      }
      if (!detail.detailResultStatus && strategy.parseDetail) {
        try {
          detail = await strategy.parseDetail({ source, item, html: detailHtml });
        } catch (error) {
          detail = {
            detailFetchError: sanitizeCrawlerError(error),
            detailResultStatus: "parser_error",
          };
        }
      }
    }
    try {
      const attachmentMetadata = strategy.extractAttachmentMetadata
        ? strategy.extractAttachmentMetadata({ source, item, detail })
        : detail.attachmentMetadata ?? [];
      const notice = strategy.normalizeNotice
        ? strategy.normalizeNotice({ source, sourceId, item, detail, attachmentMetadata })
        : { ...item, ...detail, attachmentMetadata };
      if (typeof processNoticeDocuments !== "function" || detail.detailResultStatus === "cancelled") {
        return { notice, failed: Boolean(detail.detailResultStatus) };
      }
      try {
        const processedNotice = await processNoticeDocuments({
          source,
          sourceId,
          item,
          detail,
          detailHtml,
          notice,
          signal,
          requestLimiter,
        });
        return { notice: processedNotice, failed: Boolean(detail.detailResultStatus) };
      } catch (error) {
        return {
          notice: {
            ...notice,
            documentProcessingError: sanitizeCrawlerError(error),
            detailResultStatus: classifyCrawlerFailure(error, "parser_error"),
          },
          failed: true,
        };
      }
    } catch (error) {
      return {
        notice: {
          ...item,
          sourceId,
          source_id: sourceId,
          detailFetchError: sanitizeCrawlerError(error),
          detailResultStatus: classifyCrawlerFailure(error, "parser_error"),
        },
        failed: true,
      };
    }
  }, { signal });

  const normalizedItemResults = itemResults.map((result) => result?.__bounded_map_error
    ? {
        notice: {
          sourceId,
          source_id: sourceId,
          detailFetchError: sanitizeCrawlerError(result.__bounded_map_error),
          detailResultStatus: classifyCrawlerFailure(result.__bounded_map_error, "parser_error"),
        },
        failed: true,
      }
    : result);
  const notices = normalizedItemResults.map((result) => result.notice);
  const failedItemCount = normalizedItemResults.filter((result) => result.failed).length;
  const cancelledItemCount = signal?.aborted ? Math.max(0, items.length - notices.length) : 0;
  const partial = failedItemCount > 0 || cancelledItemCount > 0;
  const resultStatus = signal?.aborted && notices.length === 0
    ? "partial"
    : partial
      ? "partial"
      : notices.length > 0
        ? "success"
        : "empty_observed";
  return {
    source_key: sourceKey,
    source_id: sourceId,
    source_name: clean(source.sourceName),
    strategy: strategy.name ?? "unknown",
    result_status: resultStatus,
    observed_count: notices.length,
    matched_count: notices.length,
    timeout: false,
    item_summary: {
      eligible_count: items.length,
      completed_count: notices.length,
      successful_count: notices.length - failedItemCount,
      failed_count: failedItemCount,
      cancelled_count: cancelledItemCount,
    },
    notices,
  };
}

function normalizeRetryCount(value) {
  const parsed = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : DEFAULT_CRAWLER_RETRY_COUNT;
  return Math.min(MAX_CRAWLER_RETRY_COUNT, parsed);
}

export function normalizeRetryBackoffMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CRAWLER_RETRY_BACKOFF_MS;
  }
  return Math.min(MAX_CRAWLER_RETRY_BACKOFF_MS, Math.max(0, Math.floor(value)));
}

function defaultClock() {
  return {
    nowMs: () => Date.now(),
    nowIso: () => new Date().toISOString(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (timer) => clearTimeout(timer),
    random: () => Math.random(),
  };
}

function timeoutError() {
  const error = new Error("Crawler source attempt timed out.");
  error.name = "AbortError";
  error.code = "attempt_timeout";
  error.crawlerStatus = "timeout";
  return error;
}

async function executeWithTimeout(operation, timeoutMs, clock, externalSignal) {
  if (externalSignal?.aborted) throw crawlerCancellationError();
  const controller = new AbortController();
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = clock.setTimeout(() => {
      controller.abort();
      reject(timeoutError());
    }, timeoutMs);
  });
  let removeExternalAbort = () => {};
  const cancellationPromise = externalSignal
    ? new Promise((_, reject) => {
        const onAbort = () => {
          controller.abort();
          reject(crawlerCancellationError());
        };
        externalSignal.addEventListener("abort", onAbort, { once: true });
        removeExternalAbort = () => externalSignal.removeEventListener("abort", onAbort);
      })
    : new Promise(() => {});
  try {
    return await Promise.race([operation(controller.signal), timeoutPromise, cancellationPromise]);
  } finally {
    if (timer !== null) clock.clearTimeout(timer);
    removeExternalAbort();
  }
}

export function isRetryableCrawlerResult(result) {
  if (result?.result_status === "timeout" || result?.result_status === "network_error") {
    return true;
  }
  if (result?.result_status !== "http_error") return false;
  const status = Number(result.http_status);
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function runBoundedCrawlerSource({
  source,
  inventoryRows,
  strategy,
  fetchHtml,
  listUrls,
  maxItems = 20,
  fetchDetails = true,
  beforeDetail,
  processNoticeDocuments,
  detailConcurrency = 1,
  requestLimiter = null,
  timeoutMs = DEFAULT_CRAWLER_TIMEOUT_MS,
  retryCount = DEFAULT_CRAWLER_RETRY_COUNT,
  retryBackoffMs = DEFAULT_CRAWLER_RETRY_BACKOFF_MS,
  maximumRetryDelayMs = MAX_CRAWLER_RETRY_BACKOFF_MS,
  retryJitterRatio = DEFAULT_CRAWLER_RETRY_JITTER_RATIO,
  signal,
  clock: suppliedClock,
}) {
  const clock = { ...defaultClock(), ...(suppliedClock ?? {}) };
  const boundedTimeoutMs = Math.max(1, Number(timeoutMs) || DEFAULT_CRAWLER_TIMEOUT_MS);
  const boundedRetryCount = normalizeRetryCount(retryCount);
  const boundedRetryBackoffMs = normalizeRetryBackoffMs(retryBackoffMs);
  const boundedMaximumRetryDelayMs = normalizeRetryBackoffMs(maximumRetryDelayMs);
  const boundedJitterRatio = Math.min(1, Math.max(0, Number(retryJitterRatio) || 0));
  const sourceStartedAt = clock.nowIso();
  const sourceStartedMs = clock.nowMs();
  const attemptHistory = [];
  let finalResult = null;

  for (let sequence = 1; sequence <= boundedRetryCount + 1; sequence += 1) {
    if (signal?.aborted) {
      finalResult = failureResult(
        clean(source?.sourceKey ?? source?.sourceId),
        null,
        "partial",
        crawlerCancellationError(),
      );
      break;
    }
    const attemptStartedAt = clock.nowIso();
    const attemptStartedMs = clock.nowMs();
    try {
      finalResult = await executeWithTimeout(
        (attemptSignal) => runCommonCrawlerSource({
          source,
          inventoryRows,
          strategy,
          fetchHtml: (url, request = {}) => fetchHtml(url, {
            ...request,
            signal: attemptSignal,
            timeoutMs: boundedTimeoutMs,
            retryCount: 0,
          }),
          listUrls,
          maxItems,
          fetchDetails,
          beforeDetail,
          processNoticeDocuments,
          detailConcurrency,
          requestLimiter,
          signal: attemptSignal,
        }),
        boundedTimeoutMs,
        clock,
        signal,
      );
    } catch (error) {
      const status = classifyCrawlerFailure(error, "network_error");
      const sourceKey = clean(source?.sourceKey ?? source?.sourceId);
      const resolution = resolveExactSourceKey(sourceKey, inventoryRows);
      finalResult = failureResult(
        sourceKey,
        resolution.blocked ? null : resolution.source_id,
        status,
        error,
      );
    }

    const attemptFinishedMs = clock.nowMs();
    const retryable = isRetryableCrawlerResult(finalResult);
    const hasNextAttempt = retryable && sequence <= boundedRetryCount;
    const retryDelay = hasNextAttempt
      ? selectRetryDelay({
          retryAfter: finalResult.retry_after,
          nowMs: clock.nowMs(),
          baseDelayMs: boundedRetryBackoffMs,
          maximumDelayMs: boundedMaximumRetryDelayMs,
          retryOrdinal: sequence - 1,
          jitterRatio: boundedJitterRatio,
          random: clock.random,
        })
      : {
          retry_delay_ms: 0,
          retry_delay_source: null,
          retry_after_ms: null,
          exponential_backoff_ms: 0,
        };
    attemptHistory.push({
      sequence,
      status: finalResult.result_status,
      retryable,
      duration_ms: Math.max(0, attemptFinishedMs - attemptStartedMs),
      reason_code: clean(finalResult.error_code) || finalResult.result_status,
      timeout: finalResult.result_status === "timeout",
      item_count: Number(finalResult.observed_count) || 0,
      started_at: attemptStartedAt,
      finished_at: clock.nowIso(),
      error_summary: sanitizeCrawlerError(finalResult.error_message),
      retry_delay_ms: retryDelay.retry_delay_ms,
      retry_delay_source: retryDelay.retry_delay_source,
      retry_after_ms: retryDelay.retry_after_ms,
      exponential_backoff_ms: retryDelay.exponential_backoff_ms,
    });
    if (!hasNextAttempt) break;
    try {
      await abortableDelay(retryDelay.retry_delay_ms, { signal, clock });
    } catch (error) {
      if (!isCrawlerCancellation(error)) throw error;
      finalResult = failureResult(
        clean(source?.sourceKey ?? source?.sourceId),
        finalResult.source_id,
        "partial",
        error,
      );
      break;
    }
  }

  const sourceFinishedMs = clock.nowMs();
  const retried = attemptHistory.length > 1;
  const recoveredAfterRetry = retried && SUCCESS_STATUSES.has(finalResult.result_status);
  const retryExhausted = isRetryableCrawlerResult(finalResult) && attemptHistory.length === boundedRetryCount + 1;
  return {
    ...finalResult,
    strategy: finalResult.strategy ?? strategy?.name ?? "unknown",
    total_attempt_count: attemptHistory.length,
    attempt_history: attemptHistory,
    timeout_ms: boundedTimeoutMs,
    retry_count_configured: boundedRetryCount,
    retry_backoff_ms: boundedRetryBackoffMs,
    maximum_retry_delay_ms: boundedMaximumRetryDelayMs,
    retry_jitter_ratio: boundedJitterRatio,
    total_retry_delay_ms: attemptHistory.reduce((sum, attempt) => sum + attempt.retry_delay_ms, 0),
    retried,
    recovered_after_retry: recoveredAfterRetry,
    retry_exhausted: retryExhausted,
    duration_ms: Math.max(0, sourceFinishedMs - sourceStartedMs),
    started_at: sourceStartedAt,
    finished_at: clock.nowIso(),
    final_reason_code: clean(finalResult.error_code) || (recoveredAfterRetry ? "recovered_after_retry" : finalResult.result_status),
    final_error_summary: sanitizeCrawlerError(finalResult.error_message),
    rate_limit_evidence: requestLimiter?.snapshot({ sourceKey: clean(source?.sourceKey ?? source?.sourceId) }) ?? null,
  };
}

function sourceSummary(result) {
  return {
    source_key: result.source_key,
    source_id: result.source_id,
    strategy: result.strategy,
    final_status: result.result_status,
    item_count: Number(result.observed_count) || 0,
    attempt_count: Number(result.total_attempt_count) || 0,
    duration_ms: Number(result.duration_ms) || 0,
    reason_code: result.final_reason_code ?? result.error_code ?? result.result_status,
    timeout: result.result_status === "timeout",
    retried: Boolean(result.retried),
    recovered_after_retry: Boolean(result.recovered_after_retry),
    retry_exhausted: Boolean(result.retry_exhausted),
    retry_backoff_ms: Number(result.retry_backoff_ms) || 0,
    maximum_retry_delay_ms: Number(result.maximum_retry_delay_ms) || 0,
    retry_jitter_ratio: Number(result.retry_jitter_ratio) || 0,
    total_retry_delay_ms: Number(result.total_retry_delay_ms) || 0,
    maximum_observed_host_concurrency: Number(result.rate_limit_evidence?.maximum_observed_host_concurrency) || 0,
    rate_limit_wait_ms: (result.rate_limit_evidence?.events ?? []).reduce(
      (sum, event) => sum + (Number(event.wait_duration_ms) || 0),
      0,
    ),
  };
}

export function buildCrawlerRunSummary(sourceResults, run = {}) {
  const results = Array.isArray(sourceResults) ? sourceResults : [];
  const successful = results.filter((result) => SUCCESS_STATUSES.has(result.result_status));
  const zeroMatch = results.filter((result) => ZERO_MATCH_STATUSES.has(result.result_status));
  const partial = results.filter((result) => PARTIAL_STATUSES.has(result.result_status));
  const failed = results.filter((result) =>
    !SUCCESS_STATUSES.has(result.result_status) &&
    !ZERO_MATCH_STATUSES.has(result.result_status) &&
    !PARTIAL_STATUSES.has(result.result_status));
  const startedMs = Number(run.started_ms);
  const finishedMs = Number(run.finished_ms);
  const overallStatus = results.length > 0 && failed.length === results.length
    ? "failed"
    : failed.length > 0 || partial.length > 0
      ? "partial"
      : zeroMatch.length > 0
        ? "completed_with_zero_match"
        : "succeeded";
  return {
    run_id: clean(run.run_id ?? run.idempotency_key) || "crawler-run",
    runner_version: clean(run.runner_version) || "engine-phase-2-common-runner-v1",
    started_at: run.started_at ?? null,
    finished_at: run.finished_at ?? null,
    duration_ms: Number.isFinite(startedMs) && Number.isFinite(finishedMs)
      ? Math.max(0, finishedMs - startedMs)
      : results.reduce((sum, result) => sum + (Number(result.duration_ms) || 0), 0),
    requested_source_count: results.length,
    completed_source_count: results.length,
    successful_source_count: successful.length,
    failed_source_count: failed.length,
    timeout_source_count: results.filter((result) => result.result_status === "timeout").length,
    zero_match_source_count: zeroMatch.length,
    partial_source_count: partial.length,
    blocked_source_count: failed.filter((result) => BLOCKED_STATUSES.has(result.result_status)).length,
    partial_or_blocked_source_count: partial.length + failed.filter((result) => BLOCKED_STATUSES.has(result.result_status)).length,
    total_attempt_count: results.reduce((sum, result) => sum + (Number(result.total_attempt_count) || 0), 0),
    retried_source_count: results.filter((result) => result.retried).length,
    recovered_after_retry_count: results.filter((result) => result.recovered_after_retry).length,
    exhausted_retry_count: results.filter((result) => result.retry_exhausted).length,
    total_retry_delay_ms: results.reduce((sum, result) => sum + (Number(result.total_retry_delay_ms) || 0), 0),
    total_observed_item_count: results.reduce((sum, result) => sum + (Number(result.observed_count) || 0), 0),
    overall_run_status: overallStatus,
    source_results: results.map(sourceSummary),
  };
}

export function validateCrawlerRunSummary(summary) {
  const errors = [];
  const sources = Array.isArray(summary?.source_results) ? summary.source_results : [];
  const categoryTotal =
    Number(summary?.successful_source_count) +
    Number(summary?.failed_source_count) +
    Number(summary?.zero_match_source_count) +
    Number(summary?.partial_source_count);
  if (Number(summary?.requested_source_count) !== sources.length) errors.push("requested_source_count_mismatch");
  if (Number(summary?.completed_source_count) !== sources.length) errors.push("completed_source_count_mismatch");
  if (categoryTotal !== Number(summary?.completed_source_count)) errors.push("source_status_arithmetic_mismatch");
  if (Number(summary?.retried_source_count) > sources.length) errors.push("retried_source_count_out_of_range");
  if (Number(summary?.recovered_after_retry_count) > Number(summary?.retried_source_count)) errors.push("recovered_count_out_of_range");
  if (Number(summary?.exhausted_retry_count) > Number(summary?.retried_source_count)) errors.push("exhausted_count_out_of_range");
  const attempts = sources.reduce((sum, source) => sum + Number(source.attempt_count || 0), 0);
  if (Number(summary?.total_attempt_count) !== attempts) errors.push("total_attempt_count_mismatch");
  const items = sources.reduce((sum, source) => sum + Number(source.item_count || 0), 0);
  if (Number(summary?.total_observed_item_count) !== items) errors.push("total_observed_item_count_mismatch");
  const retryDelay = sources.reduce((sum, source) => sum + Number(source.total_retry_delay_ms || 0), 0);
  if (Number(summary?.total_retry_delay_ms) !== retryDelay) errors.push("total_retry_delay_ms_mismatch");
  return { valid: errors.length === 0, errors };
}

export function deterministicCrawlerProjection(result) {
  return {
    run: {
      execution_mode: result?.run?.execution_mode,
      runner_version: result?.run?.runner_version,
      status: result?.run?.status,
      metadata: result?.run?.metadata ?? {},
    },
    source_results: (result?.source_results ?? []).map((source) => ({
      ...source,
      duration_ms: undefined,
      started_at: undefined,
      finished_at: undefined,
      rate_limit_evidence: source.rate_limit_evidence
        ? {
            ...source.rate_limit_evidence,
            events: source.rate_limit_evidence.events.map((event) => ({
              ...event,
              granted_at: undefined,
              observed_request_start_ms: undefined,
            })),
          }
        : null,
      attempt_history: (source.attempt_history ?? []).map((attempt) => ({
        ...attempt,
        duration_ms: undefined,
        started_at: undefined,
        finished_at: undefined,
      })),
    })),
    run_summary: {
      ...result?.run_summary,
      run_id: undefined,
      started_at: undefined,
      finished_at: undefined,
      duration_ms: undefined,
      source_results: (result?.run_summary?.source_results ?? []).map((source) => ({
        ...source,
        duration_ms: undefined,
      })),
    },
  };
}

export async function runCommonCrawler({
  sources,
  inventoryRows,
  strategyResolver,
  fetchHtml,
  run = {},
  options = {},
}) {
  const clock = { ...defaultClock(), ...(options.clock ?? {}) };
  const startedAt = run.started_at ?? clock.nowIso();
  const startedMs = clock.nowMs();
  const requestLimiter = options.requestLimiter ?? createCrawlerRateLimiter({
    minimumSourceIntervalMs: options.minimumSourceIntervalMs,
    minimumHostIntervalMs: options.minimumHostIntervalMs,
    maximumHostConcurrency: options.maximumHostConcurrency,
    clock,
  });
  const sourceConcurrency = normalizeConcurrency(options.sourceConcurrency);
  const sourceResults = await boundedMap(sources ?? [], sourceConcurrency, async (source) => {
    const strategy = strategyResolver?.(source) ?? null;
    return runBoundedCrawlerSource({
        source,
        inventoryRows,
        strategy,
        fetchHtml,
        listUrls: options.listUrls?.(source),
        maxItems: options.maxItems,
        fetchDetails: options.fetchDetails,
        beforeDetail: options.beforeDetail,
        processNoticeDocuments: options.processNoticeDocuments,
        detailConcurrency: options.detailConcurrency,
        requestLimiter,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        retryBackoffMs: options.retryBackoffMs,
        maximumRetryDelayMs: options.maximumRetryDelayMs,
        retryJitterRatio: options.retryJitterRatio,
        signal: options.signal,
        clock,
      });
  }, { signal: options.signal });
  const normalizedSourceResults = sourceResults.map((result) => {
    if (!result?.__bounded_map_error) return result;
    const error = result.__bounded_map_error;
    return failureResult("unknown-source", null, classifyCrawlerFailure(error), error);
  });
  const finishedMs = clock.nowMs();
  const finishedAt = run.finished_at ?? clock.nowIso();
  const runSummary = buildCrawlerRunSummary(normalizedSourceResults, {
    run_id: run.run_id ?? run.idempotency_key,
    runner_version: run.runner_version,
    started_at: startedAt,
    finished_at: finishedAt,
    started_ms: startedMs,
    finished_ms: finishedMs,
  });
  return {
    run: {
      idempotency_key: clean(run.idempotency_key) || "engine-phase-2-common-crawler",
      execution_mode: clean(run.execution_mode) || "fixture",
      runner_version: clean(run.runner_version) || "engine-phase-2-common-runner-v1",
      status: runSummary.overall_run_status,
      started_at: startedAt,
      finished_at: finishedAt,
      metadata: run.metadata ?? {},
    },
    source_results: normalizedSourceResults,
    run_summary: runSummary,
    execution_policy: {
      source_concurrency: sourceConcurrency,
      detail_concurrency: normalizeConcurrency(options.detailConcurrency),
      rate_limit: requestLimiter.snapshot(),
    },
  };
}
