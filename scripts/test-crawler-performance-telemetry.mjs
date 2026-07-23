import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import {
  applyCrawlerTelemetryEvent,
  calculateCpuDelta,
  CRAWLER_TELEMETRY_EVENT_SCHEMA_VERSION,
  clearCrawlerTelemetryEventSink,
  cumulativeDelta,
  finishCrawlerPerformanceTelemetry,
  getCrawlerTelemetryCounters,
  isCrawlerPerformanceTelemetryActive,
  kstDateParts,
  percentile,
  releaseCrawlerTelemetryWorker,
  sanitizeTelemetryText,
  sanitizeTelemetryUrl,
  setCrawlerTelemetryEventSink,
  startCrawlerPerformanceTelemetry,
  telemetryDetailFinished,
  telemetryDetailStarted,
  telemetryDetailsQueued,
  telemetryHttpFinished,
  telemetryHttpStarted,
  telemetryRetryDelay,
  telemetrySourceFinished,
  telemetrySourceStarted,
  telemetrySourcesQueued,
  validateCrawlerPerformanceSummary,
} from "../lib/crawler-engine/crawler-performance-telemetry.mjs";
import { resolveSourceExecutionMode } from "../lib/crawler-engine/source-execution-mode.mjs";
import {
  buildSourceExecutionErrorResult,
  buildSourceExecutionTimeoutResult,
} from "./crawl-scholarship-notices.mjs";
import {
  buildCrawlerRunSummary,
  extractSafeCrawlerErrorEvidence,
} from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
import { buildSafeSourceWorkerError } from "../lib/crawler-engine/source-execution-worker-contract.mjs";
import { attachCrawlerQualityMetrics } from "./finalize-crawler-performance-telemetry.mjs";
import { buildCombinedCrawlerPerformanceReport, COMBINED_PERFORMANCE_COLUMNS } from "./build-crawler-performance-report.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-telemetry-test-"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runTelemetryWorkerFixture = ({ mode = "normal", telemetryEnabled = true, onEvent = () => {} }) =>
  new Promise((resolve, reject) => {
    const workerId = `fixture-${mode}-${telemetryEnabled}`;
    const messages = [];
    const worker = new Worker(
      new URL("./fixtures/crawler-telemetry-worker-fixture.mjs", import.meta.url),
      { workerData: { mode, telemetryEnabled, workerId } },
    );
    worker.on("message", (message) => {
      messages.push(message);
      if (message?.type === "telemetry_event") onEvent({ ...message.event, worker_id: workerId });
    });
    worker.on("error", reject);
    worker.on("exit", (code) => resolve({ code, messages, workerId }));
  });

try {
  const disabledDirectory = path.join(temporaryRoot, "disabled");
  assert.equal(startCrawlerPerformanceTelemetry({ enabled: false, outputDirectory: disabledDirectory }), null);
  assert.equal(fs.existsSync(disabledDirectory), false, "disabled telemetry must preserve the old execution path");
  assert.deepEqual(resolveSourceExecutionMode({ sourceConcurrency: 1, isolationRequested: false }), {
    mode: "main_thread", isolation_enabled: false,
  });
  assert.deepEqual(resolveSourceExecutionMode({ sourceConcurrency: 8, isolationRequested: false }), {
    mode: "main_thread", isolation_enabled: false,
  });
  assert.deepEqual(resolveSourceExecutionMode({ sourceConcurrency: 1, isolationRequested: true }), {
    mode: "worker", isolation_enabled: true,
  });
  assert.throws(
    () => resolveSourceExecutionMode({ sourceConcurrency: 2, isolationRequested: true }),
    (error) => error.message ===
      "Worker source isolation currently requires CRAWL_SOURCE_CONCURRENCY=1 because each worker owns an independent host rate limiter.",
  );
  assert.equal(telemetryDetailStarted(), null, "disabled worker telemetry must emit no events");
  const safeWorkerEvents = [];
  setCrawlerTelemetryEventSink((event) => safeWorkerEvents.push(event));
  const bridgedDetail = telemetryDetailStarted();
  const bridgedRequest = telemetryHttpStarted({
    url: "https://user:password@example.edu/path?api_key=secret",
    attempt: 0,
  });
  telemetryHttpFinished(bridgedRequest, { status: 200, bytes: 10 });
  telemetryDetailFinished(bridgedDetail);
  telemetryRetryDelay(5);
  clearCrawlerTelemetryEventSink();
  assert.deepEqual(
    safeWorkerEvents.map((event) => event.event_type),
    ["detail_started", "http_started", "http_finished", "detail_finished", "retry_delay"],
  );
  assert.doesNotMatch(JSON.stringify(safeWorkerEvents), /password|api_key|secret|https:|stack|authorization/i);
  setCrawlerTelemetryEventSink(() => { throw new Error("sink failure"); });
  assert.equal(
    telemetryHttpStarted({ url: "https://example.edu", attempt: 0 }),
    null,
    "telemetry sink failure must not affect crawler execution",
  );
  clearCrawlerTelemetryEventSink();

  const outputDirectory = path.join(temporaryRoot, "ewha");
  startCrawlerPerformanceTelemetry({ enabled: true, outputDirectory, sampleIntervalMs: 20, universityGroup: "ewha",
    matrixMaxParallel: 5, sourceConcurrency: 2, detailConcurrency: 1, hostConcurrency: 2 });
  telemetrySourcesQueued(1); const source = telemetrySourceStarted();
  telemetryDetailsQueued(1); const detail = telemetryDetailStarted();
  const request = telemetryHttpStarted({ url: "https://user:password@example.com/a?api_key=secret", attempt: 1 });
  telemetryRetryDelay(25);
  await wait(48);
  telemetryHttpFinished(request, { status: 200, bytes: 128 });
  telemetryDetailFinished(detail); telemetrySourceFinished(source);
  const result = await finishCrawlerPerformanceTelemetry({ crawlerResult: { report: { counts: { observed: 2 } } } });
  assert.equal(isCrawlerPerformanceTelemetryActive(), false, "monitor must stop with crawler process");
  assert.ok(result.summary.measurement.sample_count >= 2, "short fixture interval should create multiple samples");
  assert.equal(result.summary.concurrency_summary.active_sources_peak, 1);
  assert.equal(result.summary.concurrency_summary.active_details_peak, 1);
  assert.ok(result.summary.resource_summary.rss_peak_bytes > 0, "RSS peak must be measured");
  assert.equal(result.summary.host_summaries[0].hostname, "example.com");
  assert.equal(result.summary.host_summaries[0].retry_count, 1);
  assert.ok(fs.readFileSync(result.paths.latestCsv, "utf8").split(/\r?\n/).length >= 3);
  assert.equal(validateCrawlerPerformanceSummary(result.summary).valid, true);

  const workerDirectory = path.join(temporaryRoot, "worker");
  startCrawlerPerformanceTelemetry({ enabled: true, outputDirectory: workerDirectory, sampleIntervalMs: 20 });
  telemetrySourcesQueued(1);
  const workerSource = telemetrySourceStarted();
  const eventBase = { schema_version: CRAWLER_TELEMETRY_EVENT_SCHEMA_VERSION, worker_id: "worker-safe" };
  assert.equal(applyCrawlerTelemetryEvent({
    ...eventBase, event_type: "detail_started", event_id: "detail-1",
  }), true);
  assert.equal(applyCrawlerTelemetryEvent({
    ...eventBase, event_type: "http_started", event_id: "http-1", hostname: "example.edu", attempt: 1,
  }), true);
  assert.equal(applyCrawlerTelemetryEvent({
    ...eventBase, event_type: "http_finished", event_id: "http-finish-1", parent_event_id: "http-1",
    duration_ms: 12, status: 200, bytes: 64, failed: false, timeout: false,
  }), true);
  assert.equal(applyCrawlerTelemetryEvent({
    ...eventBase, event_type: "detail_finished", event_id: "detail-finish-1", parent_event_id: "detail-1",
    duration_ms: 15,
  }), true);
  assert.equal(applyCrawlerTelemetryEvent({
    ...eventBase, event_type: "retry_delay", event_id: "retry-1", delay_ms: 25,
  }), true);
  telemetrySourceFinished(workerSource);
  releaseCrawlerTelemetryWorker("worker-safe", "worker_exit");
  const workerResult = await finishCrawlerPerformanceTelemetry();
  assert.equal(workerResult.summary.configuration.source_count, 1);
  assert.equal(workerResult.summary.reliability.request_count, 1);
  assert.equal(workerResult.summary.reliability.request_success_count, 1);
  assert.equal(workerResult.summary.reliability.retry_delay_total_ms, 25);
  assert.equal(workerResult.summary.host_summaries[0].request_count, 1);
  assert.deepEqual(
    {
      sources: workerResult.summary.configuration.source_count,
      details: workerResult.summary.performance.detail_duration_p50_ms !== null ? 1 : 0,
      requests: workerResult.summary.reliability.request_count,
      requestSuccess: workerResult.summary.reliability.request_success_count,
      requestFailure: workerResult.summary.reliability.request_failure_count,
      retryAttempts: workerResult.summary.reliability.retry_attempt_count,
      hostRequests: workerResult.summary.host_summaries[0].request_count,
    },
    {
      sources: result.summary.configuration.source_count,
      details: result.summary.performance.detail_duration_p50_ms !== null ? 1 : 0,
      requests: result.summary.reliability.request_count,
      requestSuccess: result.summary.reliability.request_success_count,
      requestFailure: result.summary.reliability.request_failure_count,
      retryAttempts: result.summary.reliability.retry_attempt_count,
      hostRequests: result.summary.host_summaries[0].request_count,
    },
    "main-thread and worker-bridge completed counters must agree",
  );

  const abnormalDirectory = path.join(temporaryRoot, "worker-abnormal");
  startCrawlerPerformanceTelemetry({ enabled: true, outputDirectory: abnormalDirectory, sampleIntervalMs: 20 });
  telemetrySourcesQueued(1);
  const abnormalSource = telemetrySourceStarted();
  applyCrawlerTelemetryEvent({
    ...eventBase, worker_id: "worker/unsafe id", event_type: "detail_started", event_id: "detail-abnormal",
  });
  applyCrawlerTelemetryEvent({
    ...eventBase, worker_id: "worker/unsafe id", event_type: "http_started", event_id: "http-abnormal",
    hostname: "example.edu", attempt: 0,
  });
  await wait(28);
  releaseCrawlerTelemetryWorker("worker/unsafe id", "source_execution_timeout");
  telemetrySourceFinished(abnormalSource);
  assert.deepEqual(getCrawlerTelemetryCounters(), {
    active_source_count: 0,
    active_detail_count: 0,
    active_http_request_count: 0,
    completed_source_count: 1,
    completed_detail_count: 0,
    completed_request_count: 0,
  });
  const abnormalResult = await finishCrawlerPerformanceTelemetry();
  assert.ok(abnormalResult.summary.concurrency_summary.active_http_requests_peak >= 1);
  assert.equal(abnormalResult.summary.reliability.request_success_count, 0);
  assert.match(abnormalResult.summary.warnings.join("\n"), /worker_telemetry_incomplete worker_id=worker_unsafe_id reason=source_execution_timeout/);

  const fixtureDirectory = path.join(temporaryRoot, "worker-fixture");
  startCrawlerPerformanceTelemetry({ enabled: true, outputDirectory: fixtureDirectory, sampleIntervalMs: 20 });
  telemetrySourcesQueued(1);
  const fixtureSource = telemetrySourceStarted();
  const fixtureRun = await runTelemetryWorkerFixture({
    onEvent: (event) => applyCrawlerTelemetryEvent(event),
  });
  releaseCrawlerTelemetryWorker(fixtureRun.workerId, "worker_exit");
  telemetrySourceFinished(fixtureSource);
  assert.equal(fixtureRun.code, 0);
  assert.equal(fixtureRun.messages.at(-1)?.result_status, "success");
  const fixtureResult = await finishCrawlerPerformanceTelemetry();
  assert.equal(fixtureResult.summary.reliability.request_count, 1);
  assert.equal(fixtureResult.summary.reliability.request_success_count, 1);
  assert.equal(fixtureResult.summary.reliability.retry_attempt_count, 1);
  assert.equal(fixtureResult.summary.host_summaries[0].hostname, "example.edu");
  assert.deepEqual(
    {
      completedSources: fixtureResult.summary.configuration.source_count,
      completedDetails: fixtureResult.summary.performance.detail_duration_p50_ms !== null ? 1 : 0,
      completedRequests: fixtureResult.summary.reliability.request_count,
      requestSuccess: fixtureResult.summary.reliability.request_success_count,
      requestFailure: fixtureResult.summary.reliability.request_failure_count,
      retryAttempts: fixtureResult.summary.reliability.retry_attempt_count,
      hostRequests: fixtureResult.summary.host_summaries[0].request_count,
    },
    {
      completedSources: result.summary.configuration.source_count,
      completedDetails: result.summary.performance.detail_duration_p50_ms !== null ? 1 : 0,
      completedRequests: result.summary.reliability.request_count,
      requestSuccess: result.summary.reliability.request_success_count,
      requestFailure: result.summary.reliability.request_failure_count,
      retryAttempts: result.summary.reliability.retry_attempt_count,
      hostRequests: result.summary.host_summaries[0].request_count,
    },
    "actual worker bridge and main-thread execution must produce the same operation counts",
  );

  const disabledFixtureRun = await runTelemetryWorkerFixture({ telemetryEnabled: false });
  assert.equal(disabledFixtureRun.code, 0);
  assert.equal(disabledFixtureRun.messages.some((message) => message.type === "telemetry_event"), false);
  assert.equal(disabledFixtureRun.messages.at(-1)?.result_status, "success");

  const abnormalFixtureDirectory = path.join(temporaryRoot, "worker-fixture-abnormal");
  startCrawlerPerformanceTelemetry({
    enabled: true,
    outputDirectory: abnormalFixtureDirectory,
    sampleIntervalMs: 20,
  });
  telemetrySourcesQueued(1);
  const abnormalFixtureSource = telemetrySourceStarted();
  const abnormalFixtureRun = await runTelemetryWorkerFixture({
    mode: "abnormal",
    onEvent: (event) => applyCrawlerTelemetryEvent(event),
  });
  await wait(22);
  releaseCrawlerTelemetryWorker(abnormalFixtureRun.workerId, "worker_exit");
  telemetrySourceFinished(abnormalFixtureSource);
  const abnormalFixtureResult = await finishCrawlerPerformanceTelemetry();
  assert.equal(abnormalFixtureRun.code, 2);
  assert.deepEqual(getCrawlerTelemetryCounters(), {
    active_source_count: 0,
    active_detail_count: 0,
    active_http_request_count: 0,
    completed_source_count: 1,
    completed_detail_count: 0,
    completed_request_count: 0,
  });
  assert.equal(abnormalFixtureResult.summary.reliability.request_success_count, 0);
  assert.ok(abnormalFixtureResult.summary.concurrency_summary.active_http_requests_peak >= 1);
  assert.match(abnormalFixtureResult.summary.warnings.join("\n"), /worker_telemetry_incomplete.*reason=worker_exit/);

  const sourceFixture = {
    sourceId: "fixture_source",
    sourceName: "Fixture",
    adapter: null,
  };
  const timeoutResult = buildSourceExecutionTimeoutResult(
    sourceFixture,
    new Date().toISOString(),
    Date.now(),
    [],
  );
  assert.equal(timeoutResult.result_status, "timeout");
  assert.equal(timeoutResult.error_code, "source_execution_timeout");
  assert.equal(timeoutResult.attempt_history[0].status, "timeout");
  assert.equal(timeoutResult.attempt_history[0].timeout, true);
  assert.equal(timeoutResult.transport_error_code, null);
  assert.equal(timeoutResult.final_transport_error_code, null);
  const timeoutSummary = buildCrawlerRunSummary(
    [timeoutResult],
    { run_id: "worker-timeout-test" },
  );
  assert.equal(timeoutSummary.timeout_source_count, 1);
  assert.equal(timeoutSummary.partial_source_count, 0);

  for (const [code, category, retryable] of [
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "tls_certificate", false],
    ["ECONNRESET", "connection_reset", true],
    ["UND_ERR_CONNECT_TIMEOUT", "connection_timeout", true],
  ]) {
    const error = code === "DEPTH_ZERO_SELF_SIGNED_CERT"
      ? new TypeError("fetch failed", { cause: { code } })
      : Object.assign(new Error(`safe ${code}`), { code });
    const safeEvidence = extractSafeCrawlerErrorEvidence(error);
    const serializedWorkerError = buildSafeSourceWorkerError(error);
    assert.equal(serializedWorkerError.transport_error_code, code);
    assert.equal(serializedWorkerError.transport_error_category, category);
    assert.equal(serializedWorkerError.transport_error_retryable, retryable);
    assert.equal("stack" in serializedWorkerError, false);
    assert.equal("cause" in serializedWorkerError, false);
    const workerErrorResult = buildSourceExecutionErrorResult(
      sourceFixture,
      new Date().toISOString(),
      Date.now(),
      [],
      {
        status: "network_error",
        error_code: code,
        error_message: `safe ${code}`,
        ...safeEvidence,
      },
    );
    assert.equal(workerErrorResult.transport_error_code, code);
    assert.equal(workerErrorResult.transport_error_category, category);
    assert.equal(workerErrorResult.transport_error_retryable, retryable);
    assert.equal(workerErrorResult.final_transport_error_code, code);
    assert.equal(workerErrorResult.attempt_history[0].transport_error_code, code);
  }
  const unknownEvidence = extractSafeCrawlerErrorEvidence(new Error("unknown transport"));
  const unknownWorkerError = buildSafeSourceWorkerError(new Error("unknown transport"));
  assert.equal(unknownEvidence.transport_error_code, null);
  assert.equal(unknownWorkerError.transport_error_code, null);
  const unknownResult = buildSourceExecutionErrorResult(
    sourceFixture,
    new Date().toISOString(),
    Date.now(),
    [],
    {
      status: "network_error",
      error_code: "network_error",
      error_message: "unknown transport",
      ...unknownEvidence,
    },
  );
  assert.equal(unknownResult.transport_error_code, null);
  assert.equal(unknownResult.final_transport_error_code, null);

  assert.deepEqual(calculateCpuDelta({ user: 0, system: 0 }, { user: 1_000_000, system: 0 }, 1000, 4), {
    cpu_percent_single_core_scale: 100, cpu_percent_machine: 25, cpu_cores_used: 1,
  });
  assert.equal(cumulativeDelta(100, 180), 80);
  assert.equal(cumulativeDelta(180, 100), 0);
  assert.equal(percentile([1, 2, 3, 100], 95), 100);
  assert.equal(sanitizeTelemetryUrl("https://user:pw@example.com/x?token=secret"), "https://example.com/x");
  assert.doesNotMatch(sanitizeTelemetryText("Bearer abc.def.ghi db://u:p@host api_key=secret"), /abc\.def|u:p|secret$/);
  assert.equal(kstDateParts(new Date("2026-07-23T15:30:00Z")).date, "20260724");

  const cleaned = path.join(outputDirectory, "cleaned.csv"); const rejected = path.join(outputDirectory, "rejected.csv");
  fs.writeFileSync(cleaned, "a,b\n1,2\n"); fs.writeFileSync(rejected, "a,b\n3,4\n5,6\n");
  attachCrawlerQualityMetrics(result.summary, {
    totals: { sourceCount: 3, crawledCount: 9, matchedCount: 4, newCount: 2 },
    boundedExecution: { summary: { requested_source_count: 3, successful_source_count: 1, zero_match_source_count: 1,
      partial_source_count: 1, failed_source_count: 1, timeout_source_count: 0, blocked_source_count: 0,
      retried_source_count: 1, recovered_after_retry_count: 1, exhausted_retry_count: 0, total_attempt_count: 4,
      completed_source_count: 3, total_retry_delay_ms: 50 } },
    operationalDiagnostics: { summary: { supported_source_count: 1, manual_review_source_count: 1,
      capability_status_counts: [{ capability_status: "config_or_selector_fix", source_count: 1 }],
      primary_failure_code_counts: [{ failure_code: "DETAIL_FETCH_FAILED", source_count: 1 }] } },
  }, { reportPath: "report.json", cleanedCsvPath: cleaned, rejectedCsvPath: rejected, cleanerDurationMs: 10, universityJobDurationMs: 100 });
  assert.equal(result.summary.quality.runtime_success_count, 1);
  assert.equal(result.summary.quality.cleaner_accepted_count, 1);
  assert.equal(result.summary.quality.cleaner_rejected_count, 2);
  assert.equal(result.summary.quality.detail_fetch_failure_count, 1);

  fs.writeFileSync(path.join(outputDirectory, "crawler-performance-summary-latest.json"), JSON.stringify(result.summary));
  const combined = buildCombinedCrawlerPerformanceReport({ rootDirectory: temporaryRoot, groups: ["ewha", "missing"] });
  assert.equal(combined.combined.university_count, 1);
  assert.equal(combined.combined.complete, false);
  assert.deepEqual(combined.combined.missing_groups, ["missing"]);
  assert.equal(combined.csv.split(/\r?\n/)[0], COMBINED_PERFORMANCE_COLUMNS.join(","));

  const workflow = fs.readFileSync(path.resolve(".github/workflows/crawl-scholarship-notices.yml"), "utf8");
  for (const group of ["ewha", "cau", "korea", "khu", "hanyang", "hongik", "yonsei", "skku", "uos"])
    assert.match(workflow, new RegExp(`group: \\[[^\\]]*${group}`), `matrix must include ${group}`);
  assert.ok(workflow.includes("name: crawl-result-${{ matrix.group }}"));
  assert.ok(workflow.includes(".crawler/${{ matrix.group }}-daily-state.json"));
  assert.ok(workflow.includes("fail-fast: false"));
  assert.ok(workflow.includes('CRAWL_SOURCE_EXECUTION_ISOLATION: "false"'));
  assert.ok(workflow.includes("crawler-daily-state-v2-"));
  assert.ok(workflow.includes('STATE_SOURCE="v2_legacy"'));
  assert.ok(workflow.includes("state_restore_source=${STATE_SOURCE}"));
  assert.ok(
    workflow.indexOf("Restore university crawler state v3")
      < workflow.indexOf("Restore legacy university crawler state v2"),
    "v3 state restore must run before the legacy v2 fallback",
  );
  assert.match(
    workflow,
    /steps\.check-state-v3\.outputs\.present != 'true'/,
    "legacy restore must be skipped when the actual v3 state file exists",
  );

  const failureDirectory = path.join(temporaryRoot, "failure");
  startCrawlerPerformanceTelemetry({ enabled: true, outputDirectory: failureDirectory, sampleIntervalMs: 20 });
  const failed = await finishCrawlerPerformanceTelemetry({ error: new Error("api_key=do-not-leak") });
  assert.equal(failed.summary.measurement.telemetry_status, "partial");
  assert.doesNotMatch(JSON.stringify(failed.summary), /do-not-leak/);
  assert.ok(failed.summary.measurement.sample_count >= 1, "empty-work runs still retain an initial sample");

  console.log("crawler performance telemetry tests passed");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
