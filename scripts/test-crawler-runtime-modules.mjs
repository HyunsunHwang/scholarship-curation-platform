import assert from "node:assert/strict";
import {
  analyzeRuntimeCrawlFailures,
  buildCrawlerNoticeCsv,
  buildCrawlerReport,
  buildCrawlerRunSummary,
  classifyCrawlerFailure,
  CRAWLER_NOTICE_CSV_COLUMNS,
  deterministicCrawlerProjection,
  sanitizeCrawlerError,
  validateCrawlerRunSummary,
} from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
import { buildCrawlerRunSummary as buildCrawlerRunSummaryCompatibility } from "../lib/crawler-engine/common-runner.mjs";
import {
  analyzeRuntimeCrawlFailures as analyzeRuntimeCrawlFailuresCompatibility,
} from "../lib/crawler-engine/runtime-crawl-failure-analyzer.mjs";
import {
  buildCrawlerRunSummary as buildCrawlerRunSummaryLegacyCompatibility,
} from "../lib/crawler-engine/crawler-run-summary.mjs";
import {
  buildCrawlerReport as buildCrawlerReportCompatibility,
} from "../lib/crawler-engine/crawler-report-builder.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("runtime diagnostics index and compatibility paths expose equivalent APIs", () => {
  const results = [{ result_status: "network_error", error_code: "socket_reset" }];
  const summaryInput = { run_id: "compatibility-check" };
  const reportInput = { runAt: "2026-01-01T00:00:00.000Z" };
  assert.deepEqual(
    analyzeRuntimeCrawlFailuresCompatibility(results),
    analyzeRuntimeCrawlFailures(results),
  );
  assert.deepEqual(
    buildCrawlerRunSummaryLegacyCompatibility(results, summaryInput),
    buildCrawlerRunSummary(results, summaryInput),
  );
  assert.deepEqual(
    buildCrawlerReportCompatibility(reportInput),
    buildCrawlerReport(reportInput),
  );
});

test("failure analyzer treats cancellation, empty, and unknown status safely", () => {
  assert.equal(classifyCrawlerFailure({ code: "cancelled" }, "network_error", {
    isCancellation: (error) => error?.code === "cancelled",
  }), "partial");
  assert.deepEqual(analyzeRuntimeCrawlFailures([]), {
    failed_source_count: 0,
    timeout_source_count: 0,
    partial_source_count: 0,
    blocked_source_count: 0,
    partial_or_blocked_source_count: 0,
    runtime_failure_reason_counts: [],
  });
  assert.deepEqual(analyzeRuntimeCrawlFailures([
    { result_status: "partial", error_code: "cancelled" },
    { result_status: "unknown_status", error_code: "unexpected_state" },
    { result_status: "network_error", error_code: "socket_reset" },
    { result_status: "network_error", error_code: "socket_reset" },
  ]).runtime_failure_reason_counts, [
    { reason_code: "cancelled", source_count: 1 },
    { reason_code: "socket_reset", source_count: 2 },
    { reason_code: "unexpected_state", source_count: 1 },
  ]);
});

test("failure analyzer redacts API keys, JWTs, and database credentials", () => {
  const message = sanitizeCrawlerError(
    "api_key=super-secret token=another-secret Bearer eyJabcdefghijabcdefghij.eyJabcdefghijabcdefghij.signature postgres://admin:db-password@db.example/app",
  );
  assert.equal(message.includes("super-secret"), false);
  assert.equal(message.includes("another-secret"), false);
  assert.equal(message.includes("db-password"), false);
  assert.equal(message.includes("eyJabcdefghij"), false);
});

test("run summary handles success, failure, zero match, partial, and retry recovery", () => {
  const sources = [
    { source_key: "success", result_status: "success", observed_count: 2, total_attempt_count: 1 },
    { source_key: "empty", result_status: "empty_observed", observed_count: 0, total_attempt_count: 1 },
    { source_key: "partial", result_status: "partial", error_code: "cancelled", total_attempt_count: 1 },
    { source_key: "failed", result_status: "timeout", error_code: "attempt_timeout", total_attempt_count: 2, retry_exhausted: true, retried: true },
    { source_key: "recovered", result_status: "success", observed_count: 1, total_attempt_count: 2, retried: true, recovered_after_retry: true },
  ];
  const summary = buildCrawlerRunSummary(sources, { run_id: "summary-contract" });
  assert.equal(summary.overall_run_status, "partial");
  assert.equal(summary.successful_source_count, 2);
  assert.equal(summary.zero_match_source_count, 1);
  assert.equal(summary.partial_source_count, 1);
  assert.equal(summary.failed_source_count, 1);
  assert.equal(summary.recovered_after_retry_count, 1);
  assert.equal(summary.exhausted_retry_count, 1);
  assert.deepEqual(validateCrawlerRunSummary(summary), { valid: true, errors: [] });
  assert.deepEqual(buildCrawlerRunSummaryCompatibility(sources, { run_id: "summary-contract" }), summary);
  assert.equal(buildCrawlerRunSummary([{ result_status: "timeout" }]).overall_run_status, "failed");
});

test("report builder is deterministic and preserves JSON and CSV contracts", () => {
  const executionResults = [{ source_key: "fixture", result_status: "success", notices: [{ private: true }] }];
  const input = {
    runAt: "2026-07-22T00:00:00.000Z",
    inputLabel: "fixture",
    sourceMode: "csv",
    databaseReadPerformed: false,
    totals: { sourceCount: 1 },
    executionSummary: { overall_run_status: "succeeded" },
    executionResults,
    stats: [],
    crawled: [{ sourceId: "fixture", title: "Observed", noticeUrl: "https://example.test/observed", content: " body\ntext " }],
    allMatched: [],
    allNew: [{ sourceId: "fixture", sourceName: "Fixture", title: "New", noticeUrl: "https://example.test/new", content: "A, B", imageUrls: [], attachmentMetadata: [] }],
    documentParsingEnabled: false,
  };
  const first = buildCrawlerReport(input);
  const second = buildCrawlerReport(input);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), ["runAt", "input", "sourceMode", "safety", "totals", "boundedExecution", "recovery", "perSource", "observedItems", "newNotices"]);
  assert.deepEqual(first.safety, {
    databaseReadPerformed: false,
    databaseWritePerformed: false,
    productionAccessPerformed: false,
    externalLlmCallCount: 0,
  });
  assert.equal("notices" in first.boundedExecution.sources[0], false);
  const csv = buildCrawlerNoticeCsv({ runAt: input.runAt, notices: input.allNew });
  assert.equal(csv.startsWith(`${String.fromCharCode(0xfeff)}${CRAWLER_NOTICE_CSV_COLUMNS.join(",")}${String.fromCharCode(13, 10)}`), true);
  assert.equal(csv.split("\r\n")[1].includes('"A, B"'), true);
  assert.deepEqual(deterministicCrawlerProjection({ source_results: [], run_summary: {} }), {
    run: { execution_mode: undefined, runner_version: undefined, status: undefined, metadata: {} },
    source_results: [],
    run_summary: { run_id: undefined, started_at: undefined, finished_at: undefined, duration_ms: undefined, source_results: [] },
  });
});

console.log(`Crawler runtime module tests: ${passed}/${passed} PASS`);
