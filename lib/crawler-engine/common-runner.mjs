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
  classifyCrawlerFailure as classifyRuntimeCrawlerFailure,
  extractSafeCrawlerErrorEvidence,
  isSuccessfulCrawlerResult,
  sanitizeCrawlerError,
  buildCrawlerRunSummary,
} from "./runtime-diagnostics/index.mjs";
import { aggregateOperationalListParserEvidence } from "./operational-parser-evidence.mjs";
import {
  telemetryDetailFinished,
  telemetryDetailStarted,
  telemetryDetailsQueued,
} from "./crawler-performance-telemetry.mjs";
import {
  buildPreliminaryScholarshipCandidatePlan,
  finalizeScholarshipCandidateDetection,
} from "./scholarship-candidate-pipeline.mjs";

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

function classifyCrawlerFailure(error, fallback = "network_error") {
  return classifyRuntimeCrawlerFailure(error, fallback, { isCancellation: isCrawlerCancellation });
}

function failureResult(sourceKey, sourceId, status, error) {
  const message = sanitizeCrawlerError(error) || status;
  const transportEvidence = status === "network_error"
    ? extractSafeCrawlerErrorEvidence(error)
    : {
        transport_error_code: null,
        transport_error_category: null,
        transport_error_retryable: null,
      };
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
    ...transportEvidence,
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
  candidateDetector = null,
  detailFetchPlanner = null,
  candidateDetectionOptions = {},
  detailFetchPlannerOptions = {},
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
  const parserEvidencePages = [];
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
      if (parsed.operational_parser_evidence) parserEvidencePages.push(parsed.operational_parser_evidence);
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

  const candidatePipelineEnabled = typeof candidateDetector === "function"
    && typeof detailFetchPlanner === "function";
  const { preliminaryCandidateResults, detailFetchPlan } = candidatePipelineEnabled
    ? buildPreliminaryScholarshipCandidatePlan(items, {
        detector: candidateDetector,
        planner: detailFetchPlanner,
        detectorOptions: candidateDetectionOptions,
        plannerOptions: {
          ...detailFetchPlannerOptions,
          diagnosticDetailProbeEnabled: source.detailFetchRequired !== false,
          detailFetchRequired: source.detailFetchRequired !== false,
        },
      })
    : { preliminaryCandidateResults: [], detailFetchPlan: { fetch: items, skip: [] } };
  const plannedItems = Array.isArray(detailFetchPlan?.fetch) ? detailFetchPlan.fetch : items;
  const planSkippedItems = Array.isArray(detailFetchPlan?.skip) ? detailFetchPlan.skip : [];
  const diagnosticDetailProbe = candidatePipelineEnabled
    ? detailFetchPlan?.diagnosticDetailProbe ?? null
    : null;

  const completedSet = new Set(completedWorkItemKeys ?? []);
  const scheduledItems = plannedItems.filter((item) => {
    const workItemKey = workItemIdentity?.(sourceKey, item);
    return !workItemKey || !completedSet.has(workItemKey);
  });
  const processItem = async (item, { skipDocumentProcessing = false } = {}) => {
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
        const transportEvidence = extractSafeCrawlerErrorEvidence(error);
        detail = {
          detailFetchError: sanitizeCrawlerError(error),
          detailResultStatus: classifyCrawlerFailure(error, "network_error"),
          detailTransportErrorCode: transportEvidence.transport_error_code,
          detailTransportErrorCategory: transportEvidence.transport_error_category,
          detailTransportErrorRetryable: transportEvidence.transport_error_retryable,
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
      if (
        skipDocumentProcessing
        || typeof processNoticeDocuments !== "function"
        || detail.detailResultStatus === "cancelled"
      ) {
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
  telemetryDetailsQueued(scheduledItems.length + (diagnosticDetailProbe && fetchDetails ? 1 : 0));
  const itemResults = await boundedMap(scheduledItems, boundedDetailConcurrency, async (item) => {
    const telemetryDetail = telemetryDetailStarted();
    try {
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
    } finally {
      telemetryDetailFinished(telemetryDetail);
    }
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
  let diagnosticDetailProbeResult = null;
  if (diagnosticDetailProbe?.observation) {
    if (!fetchDetails) {
      diagnosticDetailProbeResult = {
        observation_key: diagnosticDetailProbe.observationKey,
        selection_reason: diagnosticDetailProbe.selectionReason,
        notice_url: diagnosticDetailProbe.observation.noticeUrl ?? diagnosticDetailProbe.observation.notice_url ?? null,
        status: "skipped",
        detail_result_status: null,
        detail_content_extracted: null,
        detail_content_char_count: null,
        error: null,
      };
    } else {
      const telemetryDetail = telemetryDetailStarted();
      try {
        const probeResult = await processItem(diagnosticDetailProbe.observation, {
          skipDocumentProcessing: true,
        });
        const probeNotice = probeResult.notice ?? {};
        const content = clean(probeNotice.content);
        diagnosticDetailProbeResult = {
          observation_key: diagnosticDetailProbe.observationKey,
          selection_reason: diagnosticDetailProbe.selectionReason,
          notice_url: probeNotice.noticeUrl ?? probeNotice.notice_url
            ?? diagnosticDetailProbe.observation.noticeUrl ?? diagnosticDetailProbe.observation.notice_url ?? null,
          status: probeResult.failed ? "failed" : "success",
          detail_result_status: probeNotice.detailResultStatus ?? null,
          detail_transport_error_code: probeNotice.detailTransportErrorCode ?? null,
          detail_transport_error_category: probeNotice.detailTransportErrorCategory ?? null,
          detail_transport_error_retryable: probeNotice.detailTransportErrorRetryable ?? null,
          detail_content_extracted: content.length >= 20,
          detail_content_char_count: content.length,
          error: probeNotice.detailFetchError ?? null,
        };
      } finally {
        telemetryDetailFinished(telemetryDetail);
      }
    }
  }
  const candidateDetection = candidatePipelineEnabled
    ? finalizeScholarshipCandidateDetection({
        listObservations: items,
        preliminaryCandidateResults,
        detailFetchPlan,
        detailObservations: notices,
        detector: candidateDetector,
        detectorOptions: candidateDetectionOptions,
        detailFetchRequired: fetchDetails,
      })
    : null;
  const candidateFailedItemCount = normalizedItemResults.filter((result) => result.failed).length;
  const diagnosticDetailProbeFailedCount = diagnosticDetailProbeResult?.status === "failed" ? 1 : 0;
  const failedItemCount = candidateFailedItemCount + diagnosticDetailProbeFailedCount;
  const resumedSkipCount = plannedItems.length - scheduledItems.length;
  const cancelledItemCount = signal?.aborted ? Math.max(0, scheduledItems.length - notices.length) : 0;
  const partial = failedItemCount > 0 || cancelledItemCount > 0;
  const resultStatus = signal?.aborted && notices.length === 0
    ? "partial"
    : partial
      ? "partial"
      : items.length > 0
        ? "success"
        : "empty_observed";
  return {
    source_key: sourceKey,
    source_id: sourceId,
    source_name: clean(source.sourceName),
    strategy: strategy.name ?? "unknown",
    result_status: resultStatus,
    observed_count: items.length,
    matched_count: candidateDetection?.final_summary?.candidate_count ?? notices.length,
    timeout: false,
    item_summary: {
      observed_list_item_count: items.length,
      eligible_count: plannedItems.length,
      completed_count: notices.length,
      successful_count: notices.length - candidateFailedItemCount,
      failed_count: failedItemCount,
      cancelled_count: cancelledItemCount,
      preliminary_skip_count: planSkippedItems.length,
      resumed_skip_count: resumedSkipCount,
      diagnostic_detail_probe_attempted:
        ["success", "failed"].includes(diagnosticDetailProbeResult?.status) ? 1 : 0,
      diagnostic_detail_probe_failed_count: diagnosticDetailProbeFailedCount,
    },
    candidate_detection: candidateDetection,
    diagnostic_detail_probe: diagnosticDetailProbeResult,
    parser_evidence: aggregateOperationalListParserEvidence(parserEvidencePages),
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
  if (result?.transport_error_retryable === false) return false;
  if (result?.transport_error_retryable === true) return true;
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
  candidateDetector = null,
  detailFetchPlanner = null,
  candidateDetectionOptions = {},
  detailFetchPlannerOptions = {},
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
          candidateDetector,
          detailFetchPlanner,
          candidateDetectionOptions,
          detailFetchPlannerOptions,
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
      transport_error_code: finalResult.transport_error_code ?? null,
      transport_error_category: finalResult.transport_error_category ?? null,
      transport_error_retryable: finalResult.transport_error_retryable ?? null,
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
    final_transport_error_code: finalResult.transport_error_code ?? null,
    final_transport_error_category: finalResult.transport_error_category ?? null,
    final_transport_error_retryable: finalResult.transport_error_retryable ?? null,
    rate_limit_evidence: requestLimiter?.snapshot({ sourceKey: clean(source?.sourceKey ?? source?.sourceId) }) ?? null,
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
        candidateDetector: options.candidateDetector,
        detailFetchPlanner: options.detailFetchPlanner,
        candidateDetectionOptions: options.candidateDetectionOptions,
        detailFetchPlannerOptions: options.detailFetchPlannerOptions,
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
