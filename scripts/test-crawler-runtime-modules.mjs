import assert from "node:assert/strict";
import {
  analyzeRuntimeCrawlFailures,
  buildCrawlerNoticeCsv,
  buildCrawlerReport,
  buildCrawlerRunSummary,
  classifyCrawlerFailure,
  CRAWLER_NOTICE_CSV_COLUMNS,
  deterministicCrawlerProjection,
  extractSafeCrawlerErrorEvidence,
  isRetryableTransportErrorCode,
  normalizeTransportErrorCode,
  sanitizeCrawlerError,
  validateCrawlerRunSummary,
} from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
import {
  parseInsecureTlsHostAllowlist,
  shouldAllowInsecureTls,
} from "./crawl-scholarship-notices.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("insecure TLS is limited to the explicit HTTPS host allowlist", () => {
  const hosts = parseInsecureTlsHostAllowlist("econ.cau.ac.kr, hyurban.hanyang.ac.kr");
  assert.equal(shouldAllowInsecureTls("https://econ.cau.ac.kr/news/notice/", hosts), true);
  assert.equal(shouldAllowInsecureTls("https://other.cau.ac.kr/", hosts), false);
  assert.equal(shouldAllowInsecureTls("http://econ.cau.ac.kr/news/notice/", hosts), false);
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
    runtime_transport_error_category_counts: [],
    runtime_transport_error_counts: [],
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

test("failure analyzer preserves safe nested transport evidence and aggregates it", () => {
  const evidence = extractSafeCrawlerErrorEvidence(new TypeError("fetch failed", {
    cause: { code: "CERT_HAS_EXPIRED", message: "certificate has expired" },
  }));
  assert.deepEqual(evidence, {
    transport_error_code: "CERT_HAS_EXPIRED",
    transport_error_category: "tls_certificate",
    transport_error_retryable: false,
  });
  assert.equal(normalizeTransportErrorCode(" ECONNRESET "), "ECONNRESET");
  assert.equal(normalizeTransportErrorCode("connect ECONNREFUSED 10.0.0.1"), null);
  assert.equal(isRetryableTransportErrorCode("ECONNRESET"), true);
  assert.equal(isRetryableTransportErrorCode("ENOTFOUND"), false);
  assert.deepEqual(
    extractSafeCrawlerErrorEvidence(new TypeError("fetch failed", {
      cause: new Error("Response does not match the HTTP/1.1 protocol (Invalid header token)"),
    })),
    {
      transport_error_code: "INVALID_HTTP_RESPONSE",
      transport_error_category: "http_protocol",
      transport_error_retryable: false,
    },
  );
  assert.deepEqual(
    extractSafeCrawlerErrorEvidence(new TypeError("fetch failed", {
      cause: Object.assign(new Error("EE certificate key too weak"), { code: "UNSPECIFIED" }),
    })),
    {
      transport_error_code: "ERR_SSL_EE_KEY_TOO_SMALL",
      transport_error_category: "tls_certificate",
      transport_error_retryable: false,
    },
  );
  assert.deepEqual(analyzeRuntimeCrawlFailures([
    { result_status: "network_error", error_code: "network_error", transport_error_code: "CERT_HAS_EXPIRED", transport_error_category: "tls_certificate" },
    { result_status: "network_error", error_code: "network_error", transport_error_code: "ECONNRESET", transport_error_category: "connection_reset" },
    { result_status: "partial", error_code: "network_error", transport_error_code: "CERT_HAS_EXPIRED", transport_error_category: "tls_certificate" },
  ]).runtime_transport_error_counts, [
    { category: "connection_reset", code: "ECONNRESET", source_count: 1 },
    { category: "tls_certificate", code: "CERT_HAS_EXPIRED", source_count: 2 },
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
  assert.deepEqual(Object.keys(first), ["runAt", "input", "sourceMode", "safety", "totals", "boundedExecution", "operationalDiagnostics", "recovery", "perSource", "observedItems", "newNotices"]);
  assert.equal(first.operationalDiagnostics, null);
  assert.deepEqual(first.safety, {
    databaseReadPerformed: false,
    databaseWritePerformed: false,
    productionAccessPerformed: false,
    externalLlmCallCount: 0,
  });
  assert.equal("notices" in first.boundedExecution.sources[0], false);
  assert.deepEqual(first.observedItems[0], {
    sourceId: "fixture",
    title: "Observed",
    noticeUrl: "https://example.test/observed",
    listUrl: undefined,
    dateText: "",
    detailDate: "",
    parsedDate: "",
    detailFetchError: "",
    detailResultStatus: null,
    detailTransportErrorCode: null,
    detailTransportErrorCategory: null,
    detailTransportErrorRetryable: null,
    contentExcerpt: "body text",
    qualitySignals: null,
    documentEvidence: null,
    matched: false,
  });
  const detailFailureReport = buildCrawlerReport({
    ...input,
    crawled: [{
      sourceId: "fixture_source",
      title: "상세 페이지 실패 공고",
      noticeUrl: "https://example.test/notice/1",
      detailFetchError: "fetch failed",
      detailResultStatus: "network_error",
      detailTransportErrorCode: "CERT_HAS_EXPIRED",
      detailTransportErrorCategory: "tls_certificate",
      detailTransportErrorRetryable: false,
    }],
  });
  assert.equal(detailFailureReport.observedItems[0].detailResultStatus, "network_error");
  assert.equal(detailFailureReport.observedItems[0].detailTransportErrorCode, "CERT_HAS_EXPIRED");
  assert.equal(detailFailureReport.observedItems[0].detailTransportErrorCategory, "tls_certificate");
  assert.equal(detailFailureReport.observedItems[0].detailTransportErrorRetryable, false);
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
