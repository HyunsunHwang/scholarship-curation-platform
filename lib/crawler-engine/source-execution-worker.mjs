import { parentPort, workerData } from "node:worker_threads";
import {
  getAdapterCapabilityEvidence,
  buildBoundedPaginationUrls,
  getListAdapter,
  getSourceAdapterStrategy,
} from "../crawler-adapters/index.mjs";
import { runBoundedCrawlerSource } from "./common-runner.mjs";
import { extractFromList } from "./crawler-list-parser.mjs";
import { createGenericHtmlStrategy } from "./generic-html-strategy.mjs";
import { createCrawlerRateLimiter } from "./execution-policy.mjs";
import {
  createTransportBackedDocumentRuntime,
} from "./document-parsing/transport-runtime.mjs";
import { createListAdapterExecution } from "./list-adapter-strategy.mjs";
import {
  createTransportClient,
  createTransportDispatcherPool,
  sanitizeTransportUrl,
} from "./transport/index.mjs";
import {
  clearCrawlerTelemetryEventSink,
  setCrawlerTelemetryEventSink,
} from "./crawler-performance-telemetry.mjs";
import { buildSafeSourceWorkerError } from "./source-execution-worker-contract.mjs";
import {
  DEFAULT_SCHOLARSHIP_KEYWORDS,
  detectScholarshipCandidate,
} from "../detection/scholarship-candidate-detector.mjs";
import { buildDetailFetchPlan } from "./detail-fetch-planner.mjs";

let workerDispatcherPool = null;
let workerTransportClient = null;

function send(message) {
  parentPort?.postMessage(message);
}

function candidateOptions(source, config) {
  return {
    keywords: Array.isArray(source.keywords) && source.keywords.length > 0
      ? source.keywords
      : DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays: config.lookbackDays,
    allowUndated: config.allowUndated,
    undatedCandidatePolicy: source.undatedCandidatePolicy ?? "manual_review",
    now: new Date(config.runAt ?? Date.now()),
  };
}

function withTransportEvidence(result, transportClient) {
  return {
    ...result,
    transport_evidence: transportClient.evidence(),
  };
}

function stageFetch(stageFor, fetchHtml) {
  return async (url, request = {}) => {
    const stage = stageFor(request);
    send({
      type: "stage",
      stage,
      status: "started",
      detail_url: request.kind === "detail" ? sanitizeTransportUrl(url) : null,
    });
    try {
      const html = await fetchHtml(url, request);
      send({
        type: "stage",
        stage,
        status: "completed",
        detail_url: request.kind === "detail" ? sanitizeTransportUrl(url) : null,
      });
      return html;
    } catch (error) {
      send({
        type: "stage",
        stage,
        status: "failed",
        detail_url: request.kind === "detail" ? sanitizeTransportUrl(url) : null,
      });
      throw error;
    }
  };
}

async function run() {
  const {
    workerId,
    source,
    transportPolicy,
    inventoryRows,
    completedWorkItemKeys,
    config,
  } = workerData;
  if (!transportPolicy?.policyFingerprint) {
    throw new Error("Worker requires one pre-resolved transport policy.");
  }
  if (config.telemetryEnabled) {
    setCrawlerTelemetryEventSink((event) => send({
      type: "telemetry_event",
      worker_id: workerId,
      event,
    }));
  }

  const requestLimiter = createCrawlerRateLimiter({
    minimumSourceIntervalMs: config.sourceMinimumIntervalMs,
    minimumHostIntervalMs: config.hostMinimumIntervalMs,
    maximumHostConcurrency: config.hostConcurrency,
  });
  workerDispatcherPool = createTransportDispatcherPool();
  workerTransportClient = createTransportClient({
    source,
    policy: transportPolicy,
    dispatcherPool: workerDispatcherPool,
    requestLimiter,
    fallbackCharset: config.fallbackCharset,
  });
  const sourceExecutionContext = Object.freeze({
    source,
    transportPolicy,
    transportClient: workerTransportClient,
  });
  const documentRuntime = createTransportBackedDocumentRuntime({
    transportClient: workerTransportClient,
    enabled: config.documentParsingEnabled,
    cacheDirectory: config.documentCacheDirectory,
    parserOptions: {
      maxBytes: config.documentMaxBytes,
      maxPages: config.documentMaxPages,
      maxOcrPages: config.documentMaxOcrPages,
      ocrTimeoutMs: config.documentOcrTimeoutMs,
    },
  });

  const commonOptions = {
    source,
    inventoryRows,
    maxItems: config.maxItems,
    timeoutMs: transportPolicy.timeoutMs,
    retryCount: transportPolicy.retry.count,
    retryBackoffMs: transportPolicy.retry.baseDelayMs,
    maximumRetryDelayMs: transportPolicy.retry.maximumDelayMs,
    retryJitterRatio: transportPolicy.retry.jitterRatio,
    detailConcurrency: config.detailConcurrency,
    requestLimiter: null,
    completedWorkItemKeys,
    onWorkItemSettled: (item) => send({ type: "work_item", ...item }),
    processNoticeDocuments: documentRuntime.processNoticeDocuments,
    candidateDetector: detectScholarshipCandidate,
    detailFetchPlanner: buildDetailFetchPlan,
    candidateDetectionOptions: candidateOptions(source, config),
    detailFetchPlannerOptions: { seenNoticeUrls: config.seenNoticeUrls ?? [] },
  };

  const listAdapter = getListAdapter(source.adapter, source);
  if (listAdapter) {
    const adapterExecution = createListAdapterExecution({
      source,
      listAdapter,
      transportClient: workerTransportClient,
      strategyName: getSourceAdapterStrategy(source),
      adapterOptions: {
        transportPolicy: sourceExecutionContext.transportPolicy,
        lookbackDays: config.lookbackDays,
        allowUndated: config.allowUndated,
        maxItems: config.maxItems,
      },
    });
    const adapterFetch = stageFetch(
      () => "list_adapter",
      adapterExecution.fetchHtml,
    );
    const result = await runBoundedCrawlerSource({
      ...commonOptions,
      strategy: adapterExecution.strategy,
      fetchHtml: adapterFetch,
      listUrls: [source.listUrl],
      fetchDetails: false,
    });
    const executionResult = withTransportEvidence({
      ...result,
      adapter_evidence: getAdapterCapabilityEvidence(source.adapter, source, result),
    }, workerTransportClient);
    send({
      type: "result",
      execution_result: executionResult,
      notices: executionResult.notices,
    });
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
  const transportFetch = stageFetch(
    (request) => request.kind === "detail" ? "detail_fetch" : "list_fetch",
    async (url, request = {}) => (
      await workerTransportClient.fetchHtml(url, {
        ...request,
        retryCount: 0,
      })
    ).html,
  );
  const result = await runBoundedCrawlerSource({
    ...commonOptions,
    strategy,
    fetchHtml: transportFetch,
    listUrls: buildBoundedPaginationUrls(source, config.maxPages),
    fetchDetails: config.fetchDetails,
  });
  const executionResult = withTransportEvidence(result, workerTransportClient);
  send({
    type: "result",
    execution_result: executionResult,
    notices: executionResult.notices,
  });
}

run()
  .catch((error) => {
    send({
      type: "error",
      error: {
        ...buildSafeSourceWorkerError(error),
        transport_evidence: workerTransportClient?.evidence() ?? null,
      },
    });
  })
  .finally(async () => {
    clearCrawlerTelemetryEventSink();
    await workerDispatcherPool?.close();
  });
