import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_CRAWLER_RETRY_COUNT,
  DEFAULT_CRAWLER_RETRY_BACKOFF_MS,
  DEFAULT_CRAWLER_TIMEOUT_MS,
  MAX_CRAWLER_RETRY_BACKOFF_MS,
  buildCrawlerRunSummary,
  deterministicCrawlerProjection,
  runBoundedCrawlerSource,
  runCommonCrawler,
  sanitizeCrawlerError,
  validateCrawlerRunSummary,
} from "../lib/crawler-engine/common-runner.mjs";
import { classifyEnginePhase2EvidencePaths } from "../lib/crawler-engine/evidence-safety.mjs";
import {
  analyzeRuntimeCrawlFailures,
  classifyCrawlerFailure,
} from "../lib/crawler-engine/runtime-crawl-failure-analyzer.mjs";
import { buildNormalizedGraphPlan } from "../lib/post-phase-l/normalized-graph.mjs";

function source(sourceId) {
  return {
    sourceId,
    sourceName: `Fixture ${sourceId}`,
    listUrl: `https://fixtures.invalid/${sourceId}/list`,
    baseUrl: "https://fixtures.invalid",
  };
}

const sourceA = source("fixture_a");
const sourceB = source("fixture_b");
const inventoryRows = [{ source_id: "fixture_a" }, { source_id: "fixture_b" }];
const strategy = {
  name: "generic_html",
  buildListRequest: ({ listUrl }) => ({ url: listUrl, kind: "list" }),
  parseList: ({ html }) => JSON.parse(html),
  resolveDetailUrl: ({ item }) => item.noticeUrl,
  normalizeNotice: ({ sourceId, item }) => ({
    ...item,
    sourceId,
    source_key: sourceId,
    source_id: sourceId,
    original_url: item.noticeUrl,
    canonical_url: item.noticeUrl,
    body: item.body ?? "Fixture body with enough deterministic content for normalized graph compatibility.",
    attachment_metadata: [],
  }),
};

function items(sourceId, count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    title: `${sourceId} notice ${index + 1}`,
    noticeUrl: `https://fixtures.invalid/${sourceId}/notice/${index + 1}`,
  }));
}

function jsonItems(sourceId, count = 1) {
  return JSON.stringify(items(sourceId, count));
}

function networkError(message = "fetch failed") {
  return new TypeError(message);
}

function abortableHang(activeRequests) {
  return (_url, options) => new Promise((resolve, reject) => {
    activeRequests.count += 1;
    const onAbort = () => {
      activeRequests.count -= 1;
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    void resolve;
  });
}

function sequenceFetcher(sequenceByUrl) {
  const calls = new Map();
  return Object.assign(async (url, options = {}) => {
    const sequence = sequenceByUrl[url] ?? [];
    const index = calls.get(url) ?? 0;
    calls.set(url, index + 1);
    const action = sequence[Math.min(index, Math.max(0, sequence.length - 1))];
    if (typeof action === "function") return action(url, options);
    if (action instanceof Error) throw action;
    if (action === undefined) throw new Error(`No fixture response for ${url}`);
    return action;
  }, { calls });
}

function recordingBackoffClock() {
  const delays = [];
  return {
    delays,
    async sleep(ms) {
      delays.push(ms);
    },
  };
}

function runSource(target, fetchHtml, options = {}) {
  return runBoundedCrawlerSource({
    source: target,
    inventoryRows,
    strategy,
    fetchHtml,
    maxItems: options.maxItems ?? 3,
    fetchDetails: false,
    timeoutMs: options.timeoutMs ?? 30,
    retryCount: options.retryCount ?? 1,
    retryBackoffMs: options.retryBackoffMs ?? 0,
    clock: options.clock,
  });
}

function runMany(targets, fetchHtml, options = {}) {
  return runCommonCrawler({
    sources: targets,
    inventoryRows,
    strategyResolver: () => strategy,
    fetchHtml,
    run: {
      run_id: options.runId ?? "engine-phase-2-fixture",
      idempotency_key: options.runId ?? "engine-phase-2-fixture",
      execution_mode: "fixture",
      runner_version: "engine-phase-2-common-runner-v1",
      metadata: { database_read: false, database_write: false, production_access: false },
    },
    options: {
      maxItems: options.maxItems ?? 3,
      fetchDetails: false,
      timeoutMs: options.timeoutMs ?? 30,
      retryCount: options.retryCount ?? 1,
      retryBackoffMs: options.retryBackoffMs ?? 0,
      clock: options.clock,
    },
  });
}

const validations = [];
async function test(name, fn) {
  try {
    await fn();
    validations.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    validations.push({ name, passed: false, error: sanitizeCrawlerError(error) });
    throw error;
  }
}

await test("default timeout and retry are bounded", () => {
  assert.equal(DEFAULT_CRAWLER_TIMEOUT_MS, 25_000);
  assert.equal(DEFAULT_CRAWLER_RETRY_COUNT, 1);
  assert.equal(DEFAULT_CRAWLER_RETRY_BACKOFF_MS, 1_000);
  assert.equal(MAX_CRAWLER_RETRY_BACKOFF_MS, 30_000);
});

await test("healthy source succeeds in one attempt", async () => {
  const result = await runSource(sourceA, sequenceFetcher({ [sourceA.listUrl]: [jsonItems("fixture_a")] }));
  assert.equal(result.result_status, "success");
  assert.equal(result.total_attempt_count, 1);
  assert.equal(result.observed_count, 1);
});

await test("transient network failure recovers on second attempt", async () => {
  const clock = recordingBackoffClock();
  const fetcher = sequenceFetcher({ [sourceA.listUrl]: [networkError(), jsonItems("fixture_a")] });
  const result = await runSource(sourceA, fetcher, { retryBackoffMs: 100, clock });
  assert.equal(result.result_status, "success");
  assert.equal(result.total_attempt_count, 2);
  assert.equal(result.recovered_after_retry, true);
  assert.deepEqual(result.attempt_history.map((attempt) => attempt.status), ["network_error", "success"]);
  assert.deepEqual(clock.delays, [100]);
  assert.deepEqual(result.attempt_history.map((attempt) => attempt.retry_delay_ms), [100, 0]);
});

await test("timeout recovers on retry", async () => {
  const active = { count: 0 };
  const clock = recordingBackoffClock();
  const fetcher = sequenceFetcher({
    [sourceA.listUrl]: [abortableHang(active), jsonItems("fixture_a")],
  });
  const result = await runSource(sourceA, fetcher, { timeoutMs: 10, retryBackoffMs: 100, clock });
  assert.equal(result.result_status, "success");
  assert.equal(result.recovered_after_retry, true);
  assert.equal(result.attempt_history[0].timeout, true);
  assert.equal(active.count, 0);
  assert.deepEqual(clock.delays, [100]);
  assert.deepEqual(result.attempt_history.map((attempt) => attempt.retry_delay_ms), [100, 0]);
});

await test("two timeouts exhaust retry", async () => {
  const active = { count: 0 };
  const fetcher = sequenceFetcher({
    [sourceA.listUrl]: [abortableHang(active), abortableHang(active)],
  });
  const result = await runSource(sourceA, fetcher, { timeoutMs: 10 });
  assert.equal(result.result_status, "timeout");
  assert.equal(result.total_attempt_count, 2);
  assert.equal(result.retry_exhausted, true);
  assert.equal(active.count, 0);
});

await test("non-retryable config failure runs once", async () => {
  const malformed = { ...sourceA, listUrl: "not-a-url" };
  const result = await runSource(malformed, async () => jsonItems("fixture_a"));
  assert.equal(result.result_status, "configuration_error");
  assert.equal(result.total_attempt_count, 1);
  assert.equal(result.attempt_history[0].retryable, false);
});

await test("source resolution failure runs once", async () => {
  const result = await runBoundedCrawlerSource({
    source: sourceA,
    inventoryRows: [],
    strategy,
    fetchHtml: async () => jsonItems("fixture_a"),
    fetchDetails: false,
    retryCount: 3,
  });
  assert.equal(result.result_status, "source_resolution_error");
  assert.equal(result.total_attempt_count, 1);
});

await test("non-transient HTTP 4xx is not retried", async () => {
  const error = Object.assign(new Error("HTTP 404"), { httpStatus: 404 });
  const result = await runSource(sourceA, async () => { throw error; });
  assert.equal(result.result_status, "http_error");
  assert.equal(result.total_attempt_count, 1);
});

await test("transient HTTP 503 is retried", async () => {
  const clock = recordingBackoffClock();
  const error = Object.assign(new Error("HTTP 503"), { httpStatus: 503 });
  const fetcher = sequenceFetcher({ [sourceA.listUrl]: [error, jsonItems("fixture_a")] });
  const result = await runSource(sourceA, fetcher, { retryBackoffMs: 100, clock });
  assert.equal(result.result_status, "success");
  assert.equal(result.total_attempt_count, 2);
  assert.deepEqual(clock.delays, [100]);
  assert.deepEqual(result.attempt_history.map((attempt) => attempt.retry_delay_ms), [100, 0]);
});

await test("transient HTTP 429 applies backoff then succeeds", async () => {
  const clock = recordingBackoffClock();
  const error = Object.assign(new Error("HTTP 429"), { httpStatus: 429 });
  const result = await runSource(
    sourceA,
    sequenceFetcher({ [sourceA.listUrl]: [error, jsonItems("fixture_a")] }),
    { retryBackoffMs: 100, clock },
  );
  assert.equal(result.recovered_after_retry, true);
  assert.deepEqual(clock.delays, [100]);
  assert.deepEqual(result.attempt_history.map((attempt) => attempt.retry_delay_ms), [100, 0]);
});

await test("three attempts use linear retry backoff", async () => {
  const clock = recordingBackoffClock();
  const result = await runSource(
    sourceA,
    sequenceFetcher({ [sourceA.listUrl]: [networkError(), networkError(), jsonItems("fixture_a")] }),
    { retryCount: 2, retryBackoffMs: 100, clock },
  );
  assert.equal(result.total_attempt_count, 3);
  assert.equal(result.recovered_after_retry, true);
  assert.deepEqual(clock.delays, [100, 200]);
  assert.deepEqual(result.attempt_history.map((attempt) => attempt.retry_delay_ms), [100, 200, 0]);
  assert.equal(result.total_retry_delay_ms, 300);
});

await test("exhausted final attempt has no additional delay", async () => {
  const clock = recordingBackoffClock();
  const result = await runSource(
    sourceA,
    sequenceFetcher({ [sourceA.listUrl]: [networkError(), networkError()] }),
    { retryCount: 1, retryBackoffMs: 50, clock },
  );
  assert.equal(result.retry_exhausted, true);
  assert.deepEqual(clock.delays, [50]);
  assert.deepEqual(result.attempt_history.map((attempt) => attempt.retry_delay_ms), [50, 0]);
});

await test("retry backoff is clamped to the maximum", async () => {
  const clock = recordingBackoffClock();
  const result = await runSource(
    sourceA,
    sequenceFetcher({ [sourceA.listUrl]: [networkError(), jsonItems("fixture_a")] }),
    { retryBackoffMs: Number.MAX_SAFE_INTEGER, clock },
  );
  assert.equal(result.retry_backoff_ms, MAX_CRAWLER_RETRY_BACKOFF_MS);
  assert.deepEqual(clock.delays, [MAX_CRAWLER_RETRY_BACKOFF_MS]);
});

await test("zero-match remains an observation state", async () => {
  const result = await runSource(sourceA, sequenceFetcher({ [sourceA.listUrl]: ["[]"] }));
  assert.equal(result.result_status, "empty_observed");
  assert.equal(result.final_reason_code, "empty_observed");
});

const isolatedFetcher = sequenceFetcher({
  [sourceA.listUrl]: [networkError("A unavailable"), networkError("A unavailable")],
  [sourceB.listUrl]: [jsonItems("fixture_b")],
});
const isolatedRun = await runMany([sourceA, sourceB], isolatedFetcher);

await test("one source failure does not stop another source", () => {
  assert.deepEqual(isolatedRun.source_results.map((result) => result.result_status), ["network_error", "success"]);
  assert.equal(isolatedFetcher.calls.get(sourceB.listUrl), 1);
});

await test("mixed source outcomes produce partial run", () => {
  assert.equal(isolatedRun.run_summary.overall_run_status, "partial");
  assert.equal(isolatedRun.run_summary.successful_source_count, 1);
  assert.equal(isolatedRun.run_summary.failed_source_count, 1);
});

await test("all source failures produce failed run", async () => {
  const result = await runMany([sourceA, sourceB], sequenceFetcher({
    [sourceA.listUrl]: [networkError(), networkError()],
    [sourceB.listUrl]: [networkError(), networkError()],
  }));
  assert.equal(result.run_summary.overall_run_status, "failed");
  assert.equal(result.run_summary.failed_source_count, 2);
});

await test("retry does not accumulate duplicate items", async () => {
  const fetcher = sequenceFetcher({ [sourceA.listUrl]: [networkError(), jsonItems("fixture_a")] });
  const result = await runSource(sourceA, fetcher);
  assert.equal(result.notices.length, 1);
  assert.equal(new Set(result.notices.map((notice) => notice.noticeUrl)).size, 1);
});

await test("attempt histories remain source-isolated", () => {
  assert.equal(isolatedRun.source_results[0].attempt_history.length, 2);
  assert.equal(isolatedRun.source_results[1].attempt_history.length, 1);
  assert.deepEqual(isolatedRun.source_results[1].attempt_history.map((attempt) => attempt.status), ["success"]);
});

await test("max_items applies independently per source", async () => {
  const result = await runMany([sourceA, sourceB], sequenceFetcher({
    [sourceA.listUrl]: [jsonItems("fixture_a", 5)],
    [sourceB.listUrl]: [jsonItems("fixture_b", 5)],
  }), { maxItems: 2 });
  assert.deepEqual(result.source_results.map((row) => row.observed_count), [2, 2]);
});

await test("volatile-free projection is deterministic", async () => {
  const execute = () => runMany([sourceA, sourceB], sequenceFetcher({
    [sourceA.listUrl]: [jsonItems("fixture_a")],
    [sourceB.listUrl]: [jsonItems("fixture_b")],
  }), { runId: "deterministic-fixture" });
  assert.deepEqual(
    deterministicCrawlerProjection(await execute()),
    deterministicCrawlerProjection(await execute()),
  );
});

await test("deterministic projection retains configured retry delays", async () => {
  const execute = async () => {
    const clock = recordingBackoffClock();
    return runMany(
      [sourceA],
      sequenceFetcher({ [sourceA.listUrl]: [networkError(), jsonItems("fixture_a")] }),
      { runId: "retry-delay-projection", retryBackoffMs: 100, clock },
    );
  };
  const first = deterministicCrawlerProjection(await execute());
  const second = deterministicCrawlerProjection(await execute());
  assert.deepEqual(first, second);
  assert.equal(first.source_results[0].retry_backoff_ms, 100);
  assert.deepEqual(first.source_results[0].attempt_history.map((row) => row.retry_delay_ms), [100, 0]);
});

await test("secret-like error content is redacted", async () => {
  const secret = "super-secret-value";
  const result = await runSource(sourceA, async () => {
    throw new Error(`Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz123 token=${secret}`);
  }, { retryCount: 0 });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("eyJabcdefghijklmnopqrstuvwxyz123"), false);
  assert.match(serialized, /REDACTED/);
});

await test("Phase 1 normalized graph compatibility remains", async () => {
  const result = await runMany([sourceA, sourceB], sequenceFetcher({
    [sourceA.listUrl]: [jsonItems("fixture_a")],
    [sourceB.listUrl]: [jsonItems("fixture_b")],
  }), { runId: "normalized-graph-fixture" });
  const plan = buildNormalizedGraphPlan(result, { generatedAt: "2026-07-17T00:00:00.000Z" });
  assert.equal(plan.tables.ingestion_notices.length, 2);
  assert.equal(plan.tables.crawled_notices_compatibility.length, 2);
  assert.equal(plan.writes_performed, false);
});

await test("detail-level failure is explicit partial result", async () => {
  const detailStrategy = {
    ...strategy,
    buildDetailRequest: ({ item }) => ({ url: item.noticeUrl, kind: "detail" }),
    parseDetail: () => ({}),
    normalizeNotice: ({ sourceId, item, detail }) => ({
      ...item,
      ...detail,
      source_key: sourceId,
      source_id: sourceId,
      original_url: item.noticeUrl,
      canonical_url: item.noticeUrl,
    }),
  };
  const result = await runBoundedCrawlerSource({
    source: sourceA,
    inventoryRows,
    strategy: detailStrategy,
    fetchHtml: async (url) => {
      if (url === sourceA.listUrl) return jsonItems("fixture_a");
      throw networkError("detail unavailable");
    },
    fetchDetails: true,
    retryCount: 1,
  });
  assert.equal(result.result_status, "partial");
  assert.equal(result.total_attempt_count, 1);
  assert.equal(result.notices[0].detailResultStatus, "network_error");
  assert.equal(result.attempt_history[0].retry_delay_ms, 0);
});

await test("non-retryable outcomes never apply backoff", async () => {
  const clock = recordingBackoffClock();
  const http404 = Object.assign(new Error("HTTP 404"), { httpStatus: 404 });
  const parserStrategy = { ...strategy, parseList: () => { throw new Error("bad list"); } };
  const detailStrategy = {
    ...strategy,
    parseDetail: () => ({}),
    normalizeNotice: ({ sourceId, item, detail }) => ({ ...item, ...detail, source_id: sourceId }),
  };
  const cases = [
    await runSource(sourceA, async () => { throw http404; }, { retryBackoffMs: 100, clock }),
    await runBoundedCrawlerSource({
      source: sourceA, inventoryRows, strategy: parserStrategy,
      fetchHtml: async () => jsonItems("fixture_a"), fetchDetails: false,
      retryBackoffMs: 100, clock,
    }),
    await runSource({ ...sourceA, listUrl: "invalid" }, async () => "[]", { retryBackoffMs: 100, clock }),
    await runBoundedCrawlerSource({
      source: sourceA, inventoryRows: [], strategy,
      fetchHtml: async () => "[]", fetchDetails: false,
      retryBackoffMs: 100, clock,
    }),
    await runBoundedCrawlerSource({
      source: sourceA, inventoryRows, strategy: detailStrategy,
      fetchHtml: async (url) => {
        if (url === sourceA.listUrl) return jsonItems("fixture_a");
        throw networkError("detail unavailable");
      },
      fetchDetails: true, retryBackoffMs: 100, clock,
    }),
    await runSource(sourceA, async () => "[]", { retryBackoffMs: 100, clock }),
  ];
  assert.deepEqual(cases.map((result) => result.result_status), [
    "http_error", "parser_error", "configuration_error",
    "source_resolution_error", "partial", "empty_observed",
  ]);
  assert.equal(cases.every((result) => result.total_attempt_count === 1), true);
  assert.equal(cases.every((result) => result.attempt_history[0].retry_delay_ms === 0), true);
  assert.deepEqual(clock.delays, []);
});

await test("timeout timer and request are cleaned up", async () => {
  const activeRequests = { count: 0 };
  const activeTimers = new Set();
  const clock = {
    setTimeout(fn, ms) {
      const timer = setTimeout(() => {
        activeTimers.delete(timer);
        fn();
      }, ms);
      activeTimers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      clearTimeout(timer);
      activeTimers.delete(timer);
    },
  };
  const result = await runSource(
    sourceA,
    sequenceFetcher({ [sourceA.listUrl]: [abortableHang(activeRequests)] }),
    { timeoutMs: 10, retryCount: 0, clock },
  );
  assert.equal(result.result_status, "timeout");
  assert.equal(activeRequests.count, 0);
  assert.equal(activeTimers.size, 0);
});

await test("backoff timer is cleaned up after retry", async () => {
  const activeTimers = new Set();
  const clock = {
    setTimeout(fn, ms) {
      const timer = setTimeout(() => {
        activeTimers.delete(timer);
        fn();
      }, ms);
      activeTimers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      clearTimeout(timer);
      activeTimers.delete(timer);
    },
  };
  const result = await runSource(
    sourceA,
    sequenceFetcher({ [sourceA.listUrl]: [networkError(), jsonItems("fixture_a")] }),
    { retryBackoffMs: 1, clock },
  );
  assert.equal(result.result_status, "success");
  assert.equal(activeTimers.size, 0);
});

await test("committed diff safety helper detects scoped changes", () => {
  const cleanTreeCommitted = classifyEnginePhase2EvidencePaths({
    committedPaths: ["app/admin/page.tsx", "supabase/migrations/001.sql"],
    workingTreePaths: [],
    trackedPaths: [],
  });
  assert.equal(cleanTreeCommitted.admin_ui_changed, true);
  assert.equal(cleanTreeCommitted.migration_files_changed, true);
  assert.equal(cleanTreeCommitted.committed_diff_safety_check_valid, false);

  const currentScope = classifyEnginePhase2EvidencePaths({
    committedPaths: ["lib/crawler-engine/common-runner.mjs", "scripts/test-engine-phase-2-resilience-observability.mjs"],
    workingTreePaths: [],
    trackedPaths: ["reports/engine-phase-2-baseline.json"],
  });
  assert.equal(currentScope.committed_diff_safety_check_valid, true);

  const trackedRaw = classifyEnginePhase2EvidencePaths({
    committedPaths: [], workingTreePaths: [], trackedPaths: [".tmp/live/result.json"],
  });
  assert.equal(trackedRaw.raw_live_artifact_tracked, true);

  const untrackedRaw = classifyEnginePhase2EvidencePaths({
    committedPaths: [], workingTreePaths: [".tmp/live/result.json"], trackedPaths: [],
  });
  assert.equal(untrackedRaw.raw_live_artifact_tracked, false);
});

await test("recovered and exhausted retry counts are exact", async () => {
  const active = { count: 0 };
  const result = await runMany([sourceA, sourceB], sequenceFetcher({
    [sourceA.listUrl]: [networkError(), jsonItems("fixture_a")],
    [sourceB.listUrl]: [abortableHang(active), abortableHang(active)],
  }), { timeoutMs: 10 });
  assert.equal(result.run_summary.retried_source_count, 2);
  assert.equal(result.run_summary.recovered_after_retry_count, 1);
  assert.equal(result.run_summary.exhausted_retry_count, 1);
});

await test("run summary arithmetic validates", () => {
  const validation = validateCrawlerRunSummary(isolatedRun.run_summary);
  assert.deepEqual(validation, { valid: true, errors: [] });
  assert.equal(
    isolatedRun.run_summary.total_observed_item_count,
    isolatedRun.run_summary.source_results.reduce((sum, row) => sum + row.item_count, 0),
  );
  assert.equal(
    isolatedRun.run_summary.total_retry_delay_ms,
    isolatedRun.run_summary.source_results.reduce((sum, row) => sum + row.total_retry_delay_ms, 0),
  );
});

await test("summary builder distinguishes zero-match runs", async () => {
  const zero = await runSource(sourceA, sequenceFetcher({ [sourceA.listUrl]: ["[]"] }));
  const success = await runSource(sourceB, sequenceFetcher({ [sourceB.listUrl]: [jsonItems("fixture_b")] }));
  const summary = buildCrawlerRunSummary([zero, success], { run_id: "zero-match-run" });
  assert.equal(summary.overall_run_status, "completed_with_zero_match");
  assert.equal(summary.zero_match_source_count, 1);
});

await test("runtime crawl failure analyzer classifies and aggregates final failures", () => {
  const timeout = Object.assign(new Error("slow response"), { code: "attempt_timeout" });
  assert.equal(classifyCrawlerFailure(timeout), "timeout");
  assert.equal(classifyCrawlerFailure({ crawlerStatus: "parser_error" }), "parser_error");
  assert.deepEqual(analyzeRuntimeCrawlFailures([
    { result_status: "success", final_reason_code: "recovered_after_retry" },
    { result_status: "timeout", final_reason_code: "attempt_timeout" },
    { result_status: "http_error", error_code: "http_429" },
    { result_status: "partial", error_code: "cancelled" },
    { result_status: "configuration_error", error_code: "invalid_list_url" },
  ]), {
    failed_source_count: 3,
    timeout_source_count: 1,
    partial_source_count: 1,
    blocked_source_count: 1,
    partial_or_blocked_source_count: 2,
    runtime_failure_reason_counts: [
      { reason_code: "attempt_timeout", source_count: 1 },
      { reason_code: "cancelled", source_count: 1 },
      { reason_code: "http_429", source_count: 1 },
      { reason_code: "invalid_list_url", source_count: 1 },
    ],
  });
});

const failed = validations.filter((validation) => !validation.passed);
const report = {
  phase: "engine-phase-2",
  generated_at: new Date().toISOString(),
  scenario_count: validations.length,
  passed_count: validations.length - failed.length,
  failed_count: failed.length,
  deterministic_rerun_match: validations.find((row) => row.name === "volatile-free projection is deterministic")?.passed === true,
  source_isolation_valid: validations.find((row) => row.name === "attempt histories remain source-isolated")?.passed === true,
  retry_validation_passed: validations.filter((row) => /retry|transient|timeout recovers/.test(row.name)).every((row) => row.passed),
  backoff_validation_passed: validations.filter((row) => /backoff|additional delay/.test(row.name)).every((row) => row.passed),
  non_retryable_no_backoff_valid: validations.find((row) => row.name === "non-retryable outcomes never apply backoff")?.passed === true,
  linear_backoff_sequence_valid: validations.find((row) => row.name === "three attempts use linear retry backoff")?.passed === true,
  evidence_diff_self_test_valid: validations.find((row) => row.name === "committed diff safety helper detects scoped changes")?.passed === true,
  timeout_cleanup_valid: validations
    .filter((row) => row.name === "timeout timer and request are cleaned up" || row.name === "backoff timer is cleaned up after retry")
    .every((row) => row.passed),
  arithmetic_validation_passed: validations.find((row) => row.name === "run summary arithmetic validates")?.passed === true,
  normalized_graph_compatible: validations.find((row) => row.name === "Phase 1 normalized graph compatibility remains")?.passed === true,
  database_read: false,
  database_write: false,
  production_access: false,
  validations,
};
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
if (reportArg) {
  const reportPath = path.resolve(reportArg.slice("--report=".length));
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`report=${reportPath}`);
}
console.log(`Engine Phase 2 resilience tests: ${report.passed_count}/${report.scenario_count} PASS`);
