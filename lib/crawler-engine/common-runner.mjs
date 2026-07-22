import { resolveExactSourceKey } from "../post-phase-l/source-resolver.mjs";
import {
  buildCrawlerWorkItemKey,
  createCrawlerCheckpointSession,
} from "./checkpoint.mjs";
import {
  abortableDelay,
  boundedMap,
  crawlerCancellationError,
  createCrawlerRateLimiter,
  isCrawlerCancellation,
  normalizeConcurrency,
  selectRetryDelay,
} from "./execution-policy.mjs";
import {
  analyzeRuntimeCrawlFailures,
  classifyCrawlerFailure as classifyRuntimeCrawlerFailure,
  isSuccessfulCrawlerResult,
  isZeroMatchCrawlerResult,
  sanitizeCrawlerError,
} from "./runtime-crawl-failure-analyzer.mjs";

export {
  analyzeRuntimeCrawlFailures,
  CRAWLER_RESULT_STATUSES,
  sanitizeCrawlerError,
} from "./runtime-crawl-failure-analyzer.mjs";

export const DEFAULT_CRAWLER_TIMEOUT_MS = 25_000;
export const DEFAULT_CRAWLER_RETRY_COUNT = 1;
export const MAX_CRAWLER_RETRY_COUNT = 3;
export const DEFAULT_CRAWLER_RETRY_BACKOFF_MS = 1_000;
export const MAX_CRAWLER_RETRY_BACKOFF_MS = 30_000;
export const DEFAULT_CRAWLER_RETRY_JITTER_RATIO = 0;

function clean(value) {
  return String(value ?? "").trim();
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
  return classifyRuntimeCrawlerFailure(error, fallback, { isCancellation: isCrawlerCancellation });
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
  completedWorkItemKeys = [],
  workItemIdentity = buildCrawlerWorkItemKey,
  onWorkItemSettled,
  settleTimeoutMs = null,
  settleClock,
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

  const completedSet = new Set(completedWorkItemKeys ?? []);
  const scheduledItems = items.filter((item) => {
    const workItemKey = workItemIdentity?.(sourceKey, item);
    return !workItemKey || !completedSet.has(workItemKey);
  });
  const processItem = async (item) => {
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
  };
  const itemResults = await boundedMap(scheduledItems, boundedDetailConcurrency, async (item) => {
    const result = await processItem(item);
    const workItemKey = workItemIdentity?.(sourceKey, result.notice ?? item);
    if (workItemKey && typeof onWorkItemSettled === "function") {
      await onWorkItemSettled({
        sourceKey,
        workItemKey,
        status: result.failed ? (signal?.aborted ? "cancelled" : "failed") : "completed",
        reasonCode: result.notice?.detailResultStatus ?? (result.failed ? "work_item_failed" : "completed"),
      });
    }
    return result;
  }, { signal, settleTimeoutMs, clock: settleClock });

  const normalizedItemResults = itemResults.map((result) => result?.__bounded_map_abandoned
    ? {
        notice: {
          sourceId,
          source_id: sourceId,
          detailFetchError: "crawler_settle_timeout",
          detailResultStatus: "partial",
        },
        failed: true,
        abandoned: true,
      }
    : result?.__bounded_map_error
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
  const skippedItemCount = items.length - scheduledItems.length;
  const cancelledItemCount = signal?.aborted ? Math.max(0, scheduledItems.length - notices.length) : 0;
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
      resumed_skip_count: skippedItemCount,
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

async function executeWithTimeout(operation, timeoutMs, clock, externalSignal, settleTimeoutMs = 0) {
  if (externalSignal?.aborted) throw crawlerCancellationError();
  const controller = new AbortController();
  let timer = null;
  const timeoutPromise = new Promise((resolve) => {
    timer = clock.setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, timeoutMs);
  });
  let removeExternalAbort = () => {};
  const cancellationPromise = externalSignal
    ? new Promise((resolve) => {
        const onAbort = () => {
          controller.abort();
          resolve({ kind: "cancelled" });
        };
        externalSignal.addEventListener("abort", onAbort, { once: true });
        removeExternalAbort = () => externalSignal.removeEventListener("abort", onAbort);
      })
    : new Promise(() => {});
  const operationPromise = Promise.resolve()
    .then(() => operation(controller.signal))
    .then((value) => ({ kind: "completed", value }), (error) => ({ kind: "failed", error }));
  try {
    const outcome = await Promise.race([operationPromise, timeoutPromise, cancellationPromise]);
    if (outcome.kind === "completed") return outcome.value;
    if (outcome.kind === "failed") throw outcome.error;
    if (outcome.kind === "timeout") throw timeoutError();
    if (settleTimeoutMs > 0) {
      const settleController = new AbortController();
      try {
        await Promise.race([
          operationPromise,
          abortableDelay(settleTimeoutMs, { clock, signal: settleController.signal }),
        ]);
      } finally {
        settleController.abort();
      }
    }
    throw crawlerCancellationError(clean(externalSignal?.reason) || "crawler_cancelled");
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
  completedWorkItemKeys = [],
  workItemIdentity = buildCrawlerWorkItemKey,
  onWorkItemSettled,
  timeoutMs = DEFAULT_CRAWLER_TIMEOUT_MS,
  retryCount = DEFAULT_CRAWLER_RETRY_COUNT,
  retryBackoffMs = DEFAULT_CRAWLER_RETRY_BACKOFF_MS,
  maximumRetryDelayMs = MAX_CRAWLER_RETRY_BACKOFF_MS,
  retryJitterRatio = DEFAULT_CRAWLER_RETRY_JITTER_RATIO,
  settleTimeoutMs = 5_000,
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
          completedWorkItemKeys,
          workItemIdentity,
          onWorkItemSettled,
          settleTimeoutMs,
          settleClock: clock,
        }),
        boundedTimeoutMs,
        clock,
        signal,
        settleTimeoutMs,
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
  const recoveredAfterRetry = retried && isSuccessfulCrawlerResult(finalResult);
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
    settle_timeout_ms: Math.max(0, Number(settleTimeoutMs) || 0),
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
  const successful = results.filter(isSuccessfulCrawlerResult);
  const zeroMatch = results.filter(isZeroMatchCrawlerResult);
  const failureAnalysis = analyzeRuntimeCrawlFailures(results);
  const startedMs = Number(run.started_ms);
  const finishedMs = Number(run.finished_ms);
  const overallStatus = results.length > 0 && failureAnalysis.failed_source_count === results.length
    ? "failed"
    : failureAnalysis.failed_source_count > 0 || failureAnalysis.partial_source_count > 0
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
    ...failureAnalysis,
    zero_match_source_count: zeroMatch.length,
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
  const allSources = Array.from(sources ?? []);
  const sourceKeys = allSources.map((source) => clean(source?.sourceKey ?? source?.sourceId));
  const checkpointSession = options.checkpointSession ?? await createCrawlerCheckpointSession({
    checkpointPath: options.checkpointPath,
    resume: options.resume === true,
    runIdentity: run.idempotency_key ?? run.run_id,
    sourceKeys,
    configuration: {
      runner_contract_version: clean(run.runner_version) || "engine-phase-2-common-runner-v1",
      source_concurrency: normalizeConcurrency(options.sourceConcurrency),
      detail_concurrency: normalizeConcurrency(options.detailConcurrency),
      retry_count: options.retryCount,
      retry_backoff_ms: options.retryBackoffMs,
      retry_maximum_delay_ms: options.maximumRetryDelayMs,
      retry_jitter_ratio: options.retryJitterRatio,
      timeout_ms: options.timeoutMs,
      source_minimum_interval_ms: options.minimumSourceIntervalMs,
      host_minimum_interval_ms: options.minimumHostIntervalMs,
      host_concurrency: options.maximumHostConcurrency,
      fetch_details: options.fetchDetails,
      document_parsing_enabled: typeof options.processNoticeDocuments === "function",
      maximum_items_per_source: options.maxItems,
    },
    clock,
    fsApi: options.checkpointFs,
    atomicWriteOptions: options.checkpointWriteOptions,
  });
  const requestLimiter = options.requestLimiter ?? createCrawlerRateLimiter({
    minimumSourceIntervalMs: options.minimumSourceIntervalMs,
    minimumHostIntervalMs: options.minimumHostIntervalMs,
    maximumHostConcurrency: options.maximumHostConcurrency,
    clock,
  });
  const sourceConcurrency = normalizeConcurrency(options.sourceConcurrency);
  const pendingSources = allSources.filter((source) =>
    !checkpointSession?.shouldSkipSource(clean(source?.sourceKey ?? source?.sourceId)));
  const sourceResults = await boundedMap(pendingSources, sourceConcurrency, async (source) => {
    const strategy = strategyResolver?.(source) ?? null;
    const result = await runBoundedCrawlerSource({
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
        completedWorkItemKeys: checkpointSession?.snapshot().completed_work_item_keys ?? [],
        onWorkItemSettled: checkpointSession
          ? (item) => checkpointSession.recordWorkItem(item)
          : null,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        retryBackoffMs: options.retryBackoffMs,
        maximumRetryDelayMs: options.maximumRetryDelayMs,
        retryJitterRatio: options.retryJitterRatio,
        settleTimeoutMs: options.settleTimeoutMs,
        signal: options.signal,
        clock,
      });
    await checkpointSession?.recordSourceResult(result);
    return result;
  }, {
    signal: options.signal,
    settleTimeoutMs: options.settleTimeoutMs,
    clock,
  });
  const normalizedSourceResults = sourceResults.map((result) => {
    if (result?.__bounded_map_abandoned) {
      const source = pendingSources[result.index];
      return failureResult(
        clean(source?.sourceKey ?? source?.sourceId),
        null,
        "partial",
        crawlerCancellationError("crawler_settle_timeout"),
      );
    }
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
  const cancelled = options.signal?.aborted === true;
  const checkpointCancellation = cancelled && checkpointSession
    ? await checkpointSession.markCancelled(
        clean(options.signal.reason) || "crawler_cancelled",
        allSources
          .filter((source) => !checkpointSession.shouldSkipSource(clean(source?.sourceKey ?? source?.sourceId)))
          .map((source) => ({
            source_key: clean(source?.sourceKey ?? source?.sourceId),
            reason_code: clean(options.signal.reason) || "crawler_cancelled",
          })),
      )
    : null;
  if (!cancelled && checkpointSession) await checkpointSession.markCompleted();
  await checkpointSession?.flush();
  const checkpointSnapshot = checkpointSession?.snapshot() ?? null;
  const completedResumeNoop = Boolean(
    checkpointSession?.resumed && pendingSources.length === 0 && checkpointSnapshot?.status === "completed",
  );
  return {
    run: {
      idempotency_key: clean(run.idempotency_key) || "engine-phase-2-common-crawler",
      execution_mode: clean(run.execution_mode) || "fixture",
      runner_version: clean(run.runner_version) || "engine-phase-2-common-runner-v1",
      status: cancelled ? "cancelled" : completedResumeNoop ? "succeeded" : runSummary.overall_run_status,
      cancelled,
      cancellation_reason: cancelled ? clean(options.signal.reason) || "crawler_cancelled" : null,
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
    recovery: checkpointSession ? {
      checkpoint_path: checkpointSession.checkpoint_path,
      checkpoint_saved: checkpointCancellation?.checkpoint_saved ?? true,
      checkpoint_save_error: checkpointCancellation?.checkpoint_save_error ?? null,
      resumed: checkpointSession.resumed,
      run_identity: checkpointSession.run_identity,
      completed_source_count: checkpointSnapshot.completed_source_keys.length,
      completed_work_item_count: checkpointSnapshot.completed_work_item_keys.length,
      pending_source_count: Math.max(0, allSources.length - checkpointSnapshot.completed_source_keys.length),
      skipped_source_count: allSources.length - pendingSources.length,
      no_op_completed_resume: completedResumeNoop,
      status: checkpointSnapshot.status,
    } : null,
  };
}
