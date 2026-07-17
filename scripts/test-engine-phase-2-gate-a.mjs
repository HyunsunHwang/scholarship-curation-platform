import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildCrawlerRunSummary,
  deterministicCrawlerProjection,
  isRetryableCrawlerResult,
  runBoundedCrawlerSource,
  runCommonCrawler,
  runCommonCrawlerSource,
  validateCrawlerRunSummary,
} from "../lib/crawler-engine/common-runner.mjs";
import {
  abortableDelay,
  boundedMap,
  computeExponentialBackoff,
  createCrawlerRateLimiter,
  crawlerCancellationError,
  parseRetryAfter,
  selectRetryDelay,
} from "../lib/crawler-engine/execution-policy.mjs";
import { createCrawlerDocumentRuntime } from "../lib/crawler-engine/document-parsing/index.mjs";

const tests = [];
const measurements = {};
const test = (name, operation) => tests.push({ name, operation });
const source = (key, host = `${key}.invalid`) => ({ sourceId: key, sourceName: `Source ${key}`, listUrl: `https://${host}/list` });
const inventory = (...keys) => keys.map((source_id) => ({ source_id }));
const strategy = {
  name: "fixture",
  parseList: ({ source: current }) => [{ title: `${current.sourceId} notice`, noticeUrl: `https://${new URL(current.listUrl).host}/notice/1` }],
  parseDetail: ({ html }) => ({ content: html }),
  normalizeNotice: ({ sourceId, item, detail }) => ({ ...item, ...detail, sourceId, source_id: sourceId, body: detail.content ?? "fixture body" }),
};

function errorWith(status, retryAfter = null) {
  const error = new Error(`HTTP ${status}`);
  error.httpStatus = status;
  if (retryAfter !== null) error.retryAfter = retryAfter;
  return error;
}

function fakeClock({ start = Date.parse("2026-07-17T00:00:00.000Z"), randomValues = [0.5], onSleep } = {}) {
  let now = start;
  let randomIndex = 0;
  const sleeps = [];
  return {
    sleeps,
    nowMs: () => now,
    nowIso: () => new Date(now).toISOString(),
    random: () => randomValues[Math.min(randomIndex++, randomValues.length - 1)],
    async sleep(ms, signal) {
      sleeps.push(ms);
      if (onSleep) await onSleep(ms, signal);
      if (signal?.aborted) throw crawlerCancellationError();
      now += ms;
    },
    setTimeout,
    clearTimeout,
  };
}

async function retryRun({ failures, retryAfter, retryCount = failures, clock = fakeClock(), maximumRetryDelayMs = 30_000, retryJitterRatio = 0, signal } = {}) {
  let calls = 0;
  const result = await runBoundedCrawlerSource({
    source: source("retry"),
    inventoryRows: inventory("retry"),
    strategy,
    fetchHtml: async () => {
      calls += 1;
      if (calls <= failures) throw typeof retryAfter === "function" ? retryAfter(calls) : errorWith(429, retryAfter);
      return "list";
    },
    fetchDetails: false,
    retryCount,
    retryBackoffMs: 100,
    maximumRetryDelayMs,
    retryJitterRatio,
    timeoutMs: 5_000,
    clock,
    signal,
  });
  return { result, calls, clock };
}

test("Retry-After delta seconds parses", () => assert.equal(parseRetryAfter("5", 0), 5_000));
test("Retry-After HTTP date parses", () => assert.equal(parseRetryAfter("Fri, 17 Jul 2026 00:00:05 GMT", Date.parse("2026-07-17T00:00:00Z")), 5_000));
test("past Retry-After date becomes zero", () => assert.equal(parseRetryAfter("Thu, 16 Jul 2026 00:00:00 GMT", Date.parse("2026-07-17T00:00:00Z")), 0));
test("malformed Retry-After is ignored", () => assert.equal(parseRetryAfter("later please", 0), null));
test("negative Retry-After is ignored", () => assert.equal(parseRetryAfter("-2", 0), null));
test("Retry-After delta controls attempt delay", async () => {
  const { result } = await retryRun({ failures: 1, retryAfter: "5", maximumRetryDelayMs: 10_000 });
  assert.equal(result.attempt_history[0].retry_after_ms, 5_000);
  assert.equal(result.attempt_history[0].retry_delay_ms, 5_000);
  assert.equal(result.attempt_history[0].retry_delay_source, "retry_after");
  measurements.retry_after_delta_delay_ms = result.attempt_history[0].retry_delay_ms;
});
test("Retry-After date controls attempt delay", async () => {
  const { result } = await retryRun({ failures: 1, retryAfter: "Fri, 17 Jul 2026 00:00:05 GMT", maximumRetryDelayMs: 10_000 });
  assert.equal(result.attempt_history[0].retry_delay_ms, 5_000);
  measurements.retry_after_date_delay_ms = result.attempt_history[0].retry_delay_ms;
});
test("malformed Retry-After falls back to exponential", async () => {
  const { result } = await retryRun({ failures: 1, retryAfter: "bad" });
  assert.equal(result.attempt_history[0].retry_delay_ms, 100);
  assert.equal(result.attempt_history[0].retry_delay_source, "exponential_backoff");
});
test("Retry-After obeys maximum delay cap", async () => {
  const { result } = await retryRun({ failures: 1, retryAfter: "60", maximumRetryDelayMs: 1_000 });
  assert.equal(result.attempt_history[0].retry_delay_ms, 1_000);
});
test("bounded exponential sequence is deterministic", async () => {
  const { result } = await retryRun({ failures: 3, retryAfter: () => new Error("network"), retryCount: 3 });
  assert.deepEqual(result.attempt_history.map((attempt) => attempt.retry_delay_ms), [100, 200, 400, 0]);
  measurements.exponential_delay_sequence_ms = result.attempt_history.map((attempt) => attempt.retry_delay_ms);
});
test("deterministic jitter uses injected random", () => {
  const first = computeExponentialBackoff({ baseDelayMs: 1_000, maximumDelayMs: 5_000, retryOrdinal: 0, jitterRatio: 0.2, random: () => 0 });
  const last = computeExponentialBackoff({ baseDelayMs: 1_000, maximumDelayMs: 5_000, retryOrdinal: 0, jitterRatio: 0.2, random: () => 1 });
  assert.deepEqual([first, last], [800, 1_200]);
  measurements.deterministic_jitter_bounds_ms = [first, last];
});
test("Retry-After and jitter select the greater bounded delay", () => {
  assert.deepEqual(selectRetryDelay({ retryAfter: "1", nowMs: 0, baseDelayMs: 2_000, maximumDelayMs: 3_000, retryOrdinal: 0, jitterRatio: 0, random: () => 0.5 }).retry_delay_ms, 2_000);
});
test("transient network failure recovers", async () => assert.equal((await retryRun({ failures: 1, retryAfter: () => new Error("network") })).result.result_status, "success"));
test("HTTP 408 is retryable", () => assert.equal(isRetryableCrawlerResult({ result_status: "http_error", http_status: 408 }), true));
test("HTTP 429 is retryable", () => assert.equal(isRetryableCrawlerResult({ result_status: "http_error", http_status: 429 }), true));
test("HTTP 5xx is retryable", () => assert.equal(isRetryableCrawlerResult({ result_status: "http_error", http_status: 503 }), true));
test("HTTP 401 and 403 are not retryable", () => {
  assert.equal(isRetryableCrawlerResult({ result_status: "http_error", http_status: 401 }), false);
  assert.equal(isRetryableCrawlerResult({ result_status: "http_error", http_status: 403 }), false);
});
test("retry exhaustion is explicit", async () => assert.equal((await retryRun({ failures: 3, retryAfter: () => new Error("network"), retryCount: 2 })).result.retry_exhausted, true));
test("non-retryable error runs once", async () => {
  const { calls } = await retryRun({ failures: 1, retryAfter: () => errorWith(403), retryCount: 3 });
  assert.equal(calls, 1);
});
test("cancellation during retry delay schedules no next attempt", async () => {
  const controller = new AbortController();
  const clock = fakeClock({ onSleep: async () => controller.abort() });
  const { result, calls } = await retryRun({ failures: 2, retryAfter: () => new Error("network"), retryCount: 2, clock, signal: controller.signal });
  assert.equal(calls, 1);
  assert.equal(result.cancelled, true);
  assert.equal(result.result_status, "partial");
  measurements.additional_retry_count_after_abort = calls - 1;
});

test("abortable delay clears its timer", async () => {
  const controller = new AbortController();
  let timerCallback;
  let cleared = 0;
  const promise = abortableDelay(1_000, {
    signal: controller.signal,
    clock: { setTimeout(fn) { timerCallback = fn; return 1; }, clearTimeout() { cleared += 1; } },
  });
  controller.abort();
  await assert.rejects(promise, /cancelled/i);
  assert.equal(cleared, 1);
  assert.equal(typeof timerCallback, "function");
  measurements.cleared_delay_timer_count = cleared;
});
test("pre-aborted delay creates no timer", async () => {
  const controller = new AbortController(); controller.abort();
  let scheduled = 0;
  await assert.rejects(abortableDelay(100, { signal: controller.signal, clock: { setTimeout() { scheduled += 1; } } }));
  assert.equal(scheduled, 0);
});

test("same host observes minimum interval", async () => {
  const limiter = createCrawlerRateLimiter({ minimumHostIntervalMs: 100, maximumHostConcurrency: 1, clock: fakeClock() });
  const first = await limiter.acquire({ url: "https://same.invalid/a", sourceKey: "a" }); first.release();
  const second = await limiter.acquire({ url: "https://same.invalid/b", sourceKey: "b" }); second.release();
  const starts = limiter.snapshot().events.map((event) => event.observed_request_start_ms);
  assert.deepEqual(starts, [Date.parse("2026-07-17T00:00:00Z"), Date.parse("2026-07-17T00:00:00Z") + 100]);
  measurements.observed_host_interval_ms = starts[1] - starts[0];
});
test("same source observes minimum interval across hosts", async () => {
  const limiter = createCrawlerRateLimiter({ minimumSourceIntervalMs: 80, maximumHostConcurrency: 2, clock: fakeClock() });
  const first = await limiter.acquire({ url: "https://one.invalid/a", sourceKey: "same" }); first.release();
  const second = await limiter.acquire({ url: "https://two.invalid/b", sourceKey: "same" }); second.release();
  const starts = limiter.snapshot().events.map((event) => event.observed_request_start_ms);
  assert.equal(starts[1] - starts[0], 80);
  measurements.observed_source_interval_ms = starts[1] - starts[0];
});
test("different hosts can progress independently", async () => {
  const limiter = createCrawlerRateLimiter({ minimumHostIntervalMs: 100, maximumHostConcurrency: 1, clock: fakeClock() });
  const first = await limiter.acquire({ url: "https://one.invalid/a", sourceKey: "one" }); first.release();
  const second = await limiter.acquire({ url: "https://two.invalid/b", sourceKey: "two" }); second.release();
  const starts = limiter.snapshot().events.map((event) => event.observed_request_start_ms);
  assert.equal(starts[0], starts[1]);
});
test("host concurrency cap is enforced", async () => {
  const limiter = createCrawlerRateLimiter({ maximumHostConcurrency: 2, clock: fakeClock() });
  const first = await limiter.acquire({ url: "https://same.invalid/a", sourceKey: "a" });
  const second = await limiter.acquire({ url: "https://same.invalid/b", sourceKey: "b" });
  let thirdGranted = false;
  const thirdPromise = limiter.acquire({ url: "https://same.invalid/c", sourceKey: "c" }).then((permit) => { thirdGranted = true; return permit; });
  await Promise.resolve();
  assert.equal(thirdGranted, false);
  first.release();
  const third = await thirdPromise;
  second.release(); third.release();
  assert.equal(limiter.snapshot().maximum_observed_host_concurrency, 2);
  measurements.maximum_observed_host_concurrency = limiter.snapshot().maximum_observed_host_concurrency;
});
test("queued rate-limit wait is cancellable", async () => {
  const limiter = createCrawlerRateLimiter({ maximumHostConcurrency: 1, clock: fakeClock() });
  const first = await limiter.acquire({ url: "https://same.invalid/a", sourceKey: "a" });
  const controller = new AbortController();
  const queued = limiter.acquire({ url: "https://same.invalid/b", sourceKey: "b", signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, /cancelled/i);
  first.release();
  assert.equal(limiter.snapshot().cancelled_wait_count, 1);
});

async function concurrencyRun({ sourceConcurrency = 1, detailConcurrency = 1, maximumHostConcurrency = 10, itemCount = 1, failSource = null, failDetail = null } = {}) {
  let activeSources = 0; let maxSources = 0; let activeDetails = 0; let maxDetails = 0;
  const sources = [source("a", "a.invalid"), source("b", "b.invalid"), source("c", "c.invalid")];
  const customStrategy = {
    ...strategy,
    parseList: ({ source: current }) => Array.from({ length: itemCount }, (_, index) => ({ title: `${current.sourceId}-${index}`, noticeUrl: `https://${new URL(current.listUrl).host}/notice/${index}` })),
  };
  const result = await runCommonCrawler({
    sources,
    inventoryRows: inventory("a", "b", "c"),
    strategyResolver: () => customStrategy,
    fetchHtml: async (url) => {
      if (url.endsWith("/list")) {
        activeSources += 1; maxSources = Math.max(maxSources, activeSources);
        await new Promise((resolve) => setImmediate(resolve));
        activeSources -= 1;
        if (failSource && url.includes(`${failSource}.invalid`)) throw new Error("source failed");
        return "list";
      }
      activeDetails += 1; maxDetails = Math.max(maxDetails, activeDetails);
      await new Promise((resolve) => setImmediate(resolve));
      activeDetails -= 1;
      if (failDetail && url.endsWith(`/notice/${failDetail}`)) throw new Error("detail failed");
      return "detail body";
    },
    options: { sourceConcurrency, detailConcurrency, maximumHostConcurrency, retryCount: 0, timeoutMs: 5_000 },
  });
  return { result, maxSources, maxDetails };
}

test("source concurrency one is sequential", async () => assert.equal((await concurrencyRun({ sourceConcurrency: 1 })).maxSources, 1));
test("source concurrency N is bounded", async () => {
  const result = await concurrencyRun({ sourceConcurrency: 2 });
  assert.equal(result.maxSources, 2);
  measurements.maximum_observed_source_concurrency = result.maxSources;
});
test("detail concurrency one is sequential", async () => assert.equal((await concurrencyRun({ sourceConcurrency: 1, detailConcurrency: 1, itemCount: 3 })).maxDetails, 1));
test("detail concurrency N is bounded", async () => {
  const result = await concurrencyRun({ sourceConcurrency: 1, detailConcurrency: 2, itemCount: 4 });
  assert.equal(result.maxDetails, 2);
  measurements.maximum_observed_detail_concurrency = result.maxDetails;
});
test("host cap takes precedence over detail concurrency", async () => {
  const { result } = await concurrencyRun({ sourceConcurrency: 1, detailConcurrency: 4, maximumHostConcurrency: 1, itemCount: 4 });
  assert.equal(result.execution_policy.rate_limit.maximum_observed_host_concurrency, 1);
  measurements.host_cap_precedence_maximum = result.execution_policy.rate_limit.maximum_observed_host_concurrency;
});
test("one source failure does not stop other sources", async () => {
  const { result } = await concurrencyRun({ sourceConcurrency: 2, failSource: "a" });
  assert.equal(result.source_results.filter((row) => row.result_status === "success").length, 2);
  measurements.successful_sources_after_peer_failure = 2;
});
test("one detail failure does not stop sibling details", async () => {
  const { result } = await concurrencyRun({ sourceConcurrency: 1, detailConcurrency: 2, itemCount: 3, failDetail: 1 });
  assert.equal(result.source_results[0].result_status, "partial");
  assert.equal(result.source_results[0].item_summary.failed_count, 1);
  assert.equal(result.source_results[0].item_summary.successful_count, 2);
  measurements.successful_details_after_peer_failure = result.source_results[0].item_summary.successful_count;
});
test("cancellation stops new bounded-map scheduling", async () => {
  const controller = new AbortController();
  let started = 0;
  await boundedMap([1,2,3,4], 2, async () => { started += 1; controller.abort(); }, { signal: controller.signal });
  assert.equal(started, 1);
});

test("document parsing disabled preserves legacy result", async () => {
  const runtime = createCrawlerDocumentRuntime();
  const result = await runCommonCrawlerSource({ source: source("doc"), inventoryRows: inventory("doc"), strategy, fetchHtml: async () => "list", fetchDetails: false, processNoticeDocuments: runtime.processNoticeDocuments });
  assert.equal("document_extraction_results" in result.notices[0], false);
});
test("document parsing enabled remains compatible", async () => {
  const runtime = createCrawlerDocumentRuntime({ enabled: true });
  const result = await runCommonCrawlerSource({ source: source("doc"), inventoryRows: inventory("doc"), strategy, fetchHtml: async (url) => url.endsWith("/list") ? "list" : "<main><p>Readable scholarship document content with eligibility and deadline details.</p></main>", processNoticeDocuments: runtime.processNoticeDocuments, detailConcurrency: 2 });
  assert.equal(result.notices[0].document_extraction_results.length, 1);
  measurements.phase3_enabled_document_count = result.notices[0].document_extraction_results.length;
});
test("run summary arithmetic remains valid", async () => {
  const { result } = await concurrencyRun({ sourceConcurrency: 2 });
  assert.equal(validateCrawlerRunSummary(result.run_summary).valid, true);
});
test("deterministic fixture rerun matches", async () => {
  const run = async () => deterministicCrawlerProjection((await concurrencyRun({ sourceConcurrency: 2, detailConcurrency: 2, itemCount: 2 })).result);
  assert.deepEqual(await run(), await run());
});
test("summary builder retains fault isolation counts", () => {
  const summary = buildCrawlerRunSummary([{ source_key: "a", result_status: "partial", total_attempt_count: 1, observed_count: 2 }, { source_key: "b", result_status: "success", total_attempt_count: 1, observed_count: 1 }]);
  assert.equal(summary.partial_source_count, 1);
  assert.equal(summary.successful_source_count, 1);
});

let passed = 0;
const scenarioResults = [];
for (const entry of tests) {
  try {
    await entry.operation();
    passed += 1;
    scenarioResults.push({ name: entry.name, passed: true });
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    scenarioResults.push({ name: entry.name, passed: false, error: String(error?.message ?? error).slice(0, 200) });
    console.error(`FAIL ${entry.name}`);
    console.error(error);
  }
}
const output = {
  phase: "engine-phase-2-gate-a",
  scenario_count: tests.length,
  passed_count: passed,
  failed_count: tests.length - passed,
  deterministic_rerun_match: scenarioResults.find((entry) => entry.name === "deterministic fixture rerun matches")?.passed === true,
  measurements,
  scenario_results: scenarioResults,
  generated_at: new Date().toISOString(),
};
const jsonArgument = process.argv.find((value) => value.startsWith("--json="));
if (jsonArgument) {
  const outputPath = path.resolve(jsonArgument.slice("--json=".length));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
console.log(`Engine Phase 2 Gate A tests: ${passed}/${tests.length} PASS`);
if (passed !== tests.length) process.exitCode = 1;
