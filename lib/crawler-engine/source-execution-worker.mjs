import { parentPort, workerData } from "node:worker_threads";
import {
  getAdapterCapabilityEvidence,
  buildBoundedPaginationUrls,
  getListAdapter,
  getSourceAdapterStrategy,
} from "../crawler-adapters/index.mjs";
import { runBoundedCrawlerSource } from "./common-runner.mjs";
import { createGenericHtmlStrategy } from "./generic-html-strategy.mjs";
import { boundedMap, createCrawlerRateLimiter } from "./execution-policy.mjs";
import {
  createAuthoritativeDocumentRuntime,
  extractFromList,
  fetchHtml,
} from "../../scripts/crawl-scholarship-notices.mjs";
import { buildCrawlerWorkItemKey } from "./checkpoint.mjs";
import {
  clearCrawlerTelemetryEventSink,
  setCrawlerTelemetryEventSink,
} from "./crawler-performance-telemetry.mjs";
import { buildSafeSourceWorkerError } from "./source-execution-worker-contract.mjs";

function send(message) {
  parentPort?.postMessage(message);
}

function trimItems(items, maxItems) {
  if (!Number.isFinite(maxItems) || maxItems <= 0) return items;
  return items.slice(0, maxItems);
}

function buildAdapterResult({ source, notices, startedAt, startedMs, retryBackoffMs }) {
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.now() - startedMs);
  const resultStatus = notices.length > 0 ? "success" : "empty_observed";
  return {
    source_key: source.sourceId,
    source_id: source.sourceId,
    source_name: source.sourceName,
    strategy: getSourceAdapterStrategy(source),
    result_status: resultStatus,
    observed_count: notices.length,
    notices,
    total_attempt_count: 1,
    attempt_history: [{
      sequence: 1,
      status: resultStatus,
      retryable: false,
      duration_ms: durationMs,
      reason_code: resultStatus,
      timeout: false,
      item_count: notices.length,
      started_at: startedAt,
      finished_at: finishedAt,
      error_summary: "",
      retry_delay_ms: 0,
    }],
    retry_backoff_ms: retryBackoffMs,
    total_retry_delay_ms: 0,
    retried: false,
    recovered_after_retry: false,
    retry_exhausted: false,
    duration_ms: durationMs,
    started_at: startedAt,
    finished_at: finishedAt,
    final_reason_code: resultStatus,
    final_error_summary: "",
    adapter_evidence: getAdapterCapabilityEvidence(source.adapter),
  };
}

async function run() {
  const { workerId, source, inventoryRows, completedWorkItemKeys, config } = workerData;
  if (config.telemetryEnabled) {
    setCrawlerTelemetryEventSink((event) => send({
      type: "telemetry_event",
      worker_id: workerId,
      event,
    }));
  }
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const requestLimiter = createCrawlerRateLimiter({
    minimumSourceIntervalMs: config.sourceMinimumIntervalMs,
    minimumHostIntervalMs: config.hostMinimumIntervalMs,
    maximumHostConcurrency: config.hostConcurrency,
  });
  const documentRuntime = createAuthoritativeDocumentRuntime({ requestLimiter });
  const stagedFetch = async (url, request = {}) => {
    const stage = request.kind === "detail" ? "detail_fetch" : "list_fetch";
    send({ type: "stage", stage, status: "started", detail_url: request.kind === "detail" ? url : null });
    try {
      const html = await fetchHtml(url, request);
      send({ type: "stage", stage, status: "completed", detail_url: request.kind === "detail" ? url : null });
      return html;
    } catch (error) {
      send({ type: "stage", stage, status: "failed", detail_url: request.kind === "detail" ? url : null });
      throw error;
    }
  };

  const listAdapter = getListAdapter(source.adapter);
  if (listAdapter) {
    send({ type: "stage", stage: "list_adapter", status: "started" });
    let notices = trimItems(await listAdapter(source, {
      lookbackDays: config.lookbackDays,
      allowUndated: config.allowUndated,
      maxItems: config.maxItems,
    }), config.maxItems);
    send({ type: "stage", stage: "list_adapter", status: "completed" });
    if (documentRuntime.enabled) {
      notices = await boundedMap(notices, config.detailConcurrency, async (notice) => {
        const processed = await documentRuntime.processNoticeDocuments({ source, notice });
        send({ type: "work_item", source_key: source.sourceId, work_item_key: buildCrawlerWorkItemKey(source.sourceId, processed) });
        return processed;
      });
      notices = notices.filter((notice) => !notice?.__bounded_map_abandoned && !notice?.__bounded_map_error);
    }
    const executionResult = buildAdapterResult({
      source,
      notices,
      startedAt,
      startedMs,
      retryBackoffMs: config.retryBackoffMs,
    });
    send({ type: "result", execution_result: executionResult, notices });
    return;
  }

  const baseStrategy = createGenericHtmlStrategy({ parseListHtml: extractFromList });
  const stageParser = (stage, parser) => async (...args) => {
    send({ type: "stage", stage, status: "started" });
    try {
      const parsed = await parser(...args);
      send({ type: "stage", stage, status: "completed" });
      return parsed;
    } catch (error) {
      send({ type: "stage", stage, status: "failed" });
      throw error;
    }
  };
  const strategy = {
    ...baseStrategy,
    parseList: stageParser("list_parse", baseStrategy.parseList),
    parseDetail: stageParser("detail_parse", baseStrategy.parseDetail),
  };
  const result = await runBoundedCrawlerSource({
    source,
    inventoryRows,
    strategy,
    fetchHtml: stagedFetch,
    listUrls: buildBoundedPaginationUrls(source, config.maxPages),
    maxItems: config.maxItems,
    fetchDetails: config.fetchDetails,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
    retryBackoffMs: config.retryBackoffMs,
    maximumRetryDelayMs: config.retryMaximumDelayMs,
    retryJitterRatio: config.retryJitterRatio,
    detailConcurrency: config.detailConcurrency,
    requestLimiter,
    completedWorkItemKeys,
    onWorkItemSettled: (item) => send({ type: "work_item", ...item }),
    processNoticeDocuments: documentRuntime.processNoticeDocuments,
  });
  send({ type: "result", execution_result: result, notices: result.notices });
}

run()
  .catch((error) => {
    send({
      type: "error",
      error: buildSafeSourceWorkerError(error),
    });
  })
  .finally(() => clearCrawlerTelemetryEventSink());
