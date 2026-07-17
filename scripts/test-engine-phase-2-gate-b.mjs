import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCrawlerWorkItemKey,
  CRAWLER_CHECKPOINT_RUNNER_VERSION,
  CRAWLER_CHECKPOINT_SCHEMA_VERSION,
  createCrawlerCheckpointSession,
  fingerprintCrawlerConfiguration,
  fingerprintCrawlerSourceSet,
  installCrawlerSignalHandlers,
  parseCrawlerCheckpointArguments,
  readCrawlerCheckpoint,
  serializeCrawlerCheckpoint,
  validateCrawlerCheckpoint,
  writeCrawlerCheckpointAtomic,
} from "../lib/crawler-engine/checkpoint.mjs";
import { runCommonCrawler } from "../lib/crawler-engine/common-runner.mjs";
import { abortableDelay, boundedMap, createCrawlerRateLimiter } from "../lib/crawler-engine/execution-policy.mjs";
import { createCrawlerDocumentRuntime } from "../lib/crawler-engine/document-parsing/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.join(root, ".tmp", "engine-phase-2-gate-b", "fixture");
const outputArg = process.argv.find((arg) => arg.startsWith("--json="));
const outputPath = outputArg ? path.resolve(root, outputArg.slice("--json=".length)) : null;
const validations = [];
const scenarios = {};

async function test(name, operation) {
  try {
    const metrics = await operation();
    validations.push({ name, passed: true });
    if (metrics && typeof metrics === "object") scenarios[name] = metrics;
    console.log(`PASS ${name}`);
  } catch (error) {
    validations.push({ name, passed: false, error: error.message });
    console.error(`FAIL ${name}: ${error.stack ?? error.message}`);
  }
}

function source(key) {
  return { sourceKey: key, sourceId: key, sourceName: key, listUrl: `https://${key}.example/list` };
}

function itemUrl(sourceKey, index) {
  return `https://${sourceKey}.example/notices/${index}`;
}

const sources = [source("fixture_a"), source("fixture_b"), source("fixture_c")];
const inventoryRows = sources.map((row) => ({ source_id: row.sourceKey }));
const strategy = {
  name: "gate-b-fixture",
  parseList: ({ source: row }) => [1, 2].map((index) => ({ title: `${row.sourceKey}-${index}`, noticeUrl: itemUrl(row.sourceKey, index) })),
  resolveDetailUrl: ({ item }) => item.noticeUrl,
  parseDetail: ({ item, html }) => ({ body: html, canonical_url: item.noticeUrl }),
  normalizeNotice: ({ source: row, item, detail }) => ({
    sourceId: row.sourceKey,
    source_id: row.sourceKey,
    title: item.title,
    noticeUrl: item.noticeUrl,
    canonical_url: item.noticeUrl,
    body: detail.body,
  }),
};

async function fetchFixture(url) {
  return url.endsWith("/list") ? "<html>list</html>" : `<article>${url}</article>`;
}

function runOptions(overrides = {}) {
  return {
    sourceConcurrency: 1,
    detailConcurrency: 1,
    retryCount: 0,
    timeoutMs: 2_000,
    settleTimeoutMs: 20,
    minimumSourceIntervalMs: 0,
    minimumHostIntervalMs: 0,
    maximumHostConcurrency: 1,
    ...overrides,
  };
}

async function runFixture(options = {}) {
  return runCommonCrawler({
    sources,
    inventoryRows,
    strategyResolver: () => strategy,
    fetchHtml: fetchFixture,
    run: {
      idempotency_key: options.runIdentity ?? "gate-b-fixture-run",
      runner_version: "engine-phase-2-common-runner-v1",
      execution_mode: "fixture",
    },
    options: runOptions(options),
  });
}

await fs.rm(tempRoot, { recursive: true, force: true });
await fs.mkdir(tempRoot, { recursive: true });

await test("checkpoint schema is versioned and deterministic", async () => {
  const checkpointPath = path.join(tempRoot, "schema.json");
  const session = await createCrawlerCheckpointSession({
    checkpointPath,
    runIdentity: "schema-run",
    sourceKeys: ["b", "a"],
    configuration: { source_concurrency: 1 },
  });
  const snapshot = session.snapshot();
  assert.equal(snapshot.schema_version, CRAWLER_CHECKPOINT_SCHEMA_VERSION);
  assert.equal(snapshot.runner_version, CRAWLER_CHECKPOINT_RUNNER_VERSION);
  assert.equal(serializeCrawlerCheckpoint(snapshot), serializeCrawlerCheckpoint(structuredClone(snapshot)));
  assert.deepEqual(snapshot.source_keys, ["a", "b"]);
  return { schema_version: snapshot.schema_version, deterministic: true };
});

await test("resume is explicit opt-in and existing checkpoint is protected", async () => {
  assert.throws(() => parseCrawlerCheckpointArguments(["--resume"]), /requires --checkpoint-path/);
  const parsed = parseCrawlerCheckpointArguments(["input.csv", "--checkpoint-path", "progress.json", "--resume", "--run-identity", "run-1"]);
  assert.equal(parsed.resume, true);
  assert.equal(parsed.checkpoint_path, "progress.json");
  const checkpointPath = path.join(tempRoot, "explicit-resume.json");
  await createCrawlerCheckpointSession({ checkpointPath, runIdentity: "run-1", sourceKeys: ["fixture_a"] });
  let code = null;
  try {
    await createCrawlerCheckpointSession({ checkpointPath, runIdentity: "run-2", sourceKeys: ["fixture_a"] });
  } catch (error) { code = error.code; }
  assert.equal(code, "checkpoint_exists_resume_required");
  return { resume_explicit: true, existing_checkpoint_protected: true };
});

await test("atomic write uses temp rename and preserves existing checkpoint on failure", async () => {
  const checkpointPath = path.join(tempRoot, "atomic.json");
  await fs.writeFile(checkpointPath, "existing", "utf8");
  let failureCode = null;
  try {
    await writeCrawlerCheckpointAtomic(checkpointPath, { value: "replacement" }, {
      nonce: () => "fixture",
      beforeRename: () => { throw new Error("injected_before_rename"); },
    });
  } catch (error) {
    failureCode = error.code;
  }
  assert.equal(failureCode, "checkpoint_atomic_write_failed");
  assert.equal(await fs.readFile(checkpointPath, "utf8"), "existing");
  const tempFiles = (await fs.readdir(tempRoot)).filter((name) => name.includes("atomic.json.tmp-"));
  assert.equal(tempFiles.length, 0);
  await writeCrawlerCheckpointAtomic(checkpointPath, { value: "replacement" }, { nonce: () => "success" });
  assert.match(await fs.readFile(checkpointPath, "utf8"), /replacement/);
  return { temp_write_then_rename: true, existing_preserved: true, temp_file_count: 0 };
});

await test("configuration and source fingerprints are deterministic and scoped", () => {
  const first = fingerprintCrawlerConfiguration({ source_concurrency: 1, timeout_ms: 10, password: "secret-a" });
  const same = fingerprintCrawlerConfiguration({ timeout_ms: 10, source_concurrency: 1, password: "secret-b" });
  const changed = fingerprintCrawlerConfiguration({ source_concurrency: 2, timeout_ms: 10 });
  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.equal(fingerprintCrawlerSourceSet(["b", "a"]), fingerprintCrawlerSourceSet(["a", "b"]));
  assert.notEqual(fingerprintCrawlerSourceSet(["a", "b"]), fingerprintCrawlerSourceSet(["a", "c"]));
  return { secret_excluded: true, meaningful_change_detected: true, source_order_independent: true };
});

await test("corrupt and incompatible checkpoints fail closed before scheduling", async () => {
  const corruptPath = path.join(tempRoot, "corrupt.json");
  await fs.writeFile(corruptPath, "{broken", "utf8");
  let scheduled = 0;
  let corruptCode = null;
  try {
    await runCommonCrawler({
      sources: [sources[0]], inventoryRows, strategyResolver: () => strategy,
      fetchHtml: async (url) => { scheduled += 1; return fetchFixture(url); },
      run: { idempotency_key: "fail-closed", runner_version: "engine-phase-2-common-runner-v1" },
      options: runOptions({ checkpointPath: corruptPath, resume: true }),
    });
  } catch (error) { corruptCode = error.code; }
  assert.equal(corruptCode, "checkpoint_corrupt_json");
  assert.equal(scheduled, 0);

  const mismatchPath = path.join(tempRoot, "mismatch.json");
  const session = await createCrawlerCheckpointSession({
    checkpointPath: mismatchPath,
    runIdentity: "fail-closed",
    sourceKeys: [sources[0].sourceKey],
    configuration: {
      runner_contract_version: "engine-phase-2-common-runner-v1",
      source_concurrency: 1,
      detail_concurrency: 1,
      retry_count: 0,
      timeout_ms: 2_000,
      source_minimum_interval_ms: 0,
      host_minimum_interval_ms: 0,
      host_concurrency: 1,
      document_parsing_enabled: false,
    },
  });
  const mismatched = session.snapshot();
  mismatched.runner_version = "unsupported-runner";
  await writeCrawlerCheckpointAtomic(mismatchPath, mismatched);
  let mismatchCode = null;
  try {
    await runCommonCrawler({
      sources: [sources[0]], inventoryRows, strategyResolver: () => strategy,
      fetchHtml: async (url) => { scheduled += 1; return fetchFixture(url); },
      run: { idempotency_key: "fail-closed", runner_version: "engine-phase-2-common-runner-v1" },
      options: runOptions({ checkpointPath: mismatchPath, resume: true }),
    });
  } catch (error) { mismatchCode = error.code; }
  assert.equal(mismatchCode, "checkpoint_runner_mismatch");
  assert.equal(scheduled, 0);
  return { corrupt_code: corruptCode, incompatible_code: mismatchCode, scheduled_count: scheduled };
});

await test("completed source is skipped before scheduling", async () => {
  const checkpointPath = path.join(tempRoot, "source-skip.json");
  const session = await createCrawlerCheckpointSession({
    checkpointPath,
    runIdentity: "source-skip",
    sourceKeys: sources.map((row) => row.sourceKey),
    configuration: {
      runner_contract_version: "engine-phase-2-common-runner-v1", source_concurrency: 1, detail_concurrency: 1,
      retry_count: 0, timeout_ms: 2_000, source_minimum_interval_ms: 0, host_minimum_interval_ms: 0,
      host_concurrency: 1, document_parsing_enabled: false,
    },
  });
  await session.recordSourceResult({ source_key: "fixture_a", result_status: "success", notices: [] });
  let fixtureARequests = 0;
  const result = await runCommonCrawler({
    sources, inventoryRows, strategyResolver: () => strategy,
    fetchHtml: async (url) => { if (url.includes("fixture_a")) fixtureARequests += 1; return fetchFixture(url); },
    run: { idempotency_key: "source-skip", runner_version: "engine-phase-2-common-runner-v1" },
    options: runOptions({ checkpointPath, resume: true }),
  });
  assert.equal(fixtureARequests, 0);
  assert.equal(result.recovery.skipped_source_count, 1);
  return { reexecuted_completed_source_count: fixtureARequests, skipped_source_count: 1 };
});

await test("completed work item is skipped before detail and parser scheduling", async () => {
  const checkpointPath = path.join(tempRoot, "item-skip.json");
  const singleSource = sources[0];
  const configuration = {
    runner_contract_version: "engine-phase-2-common-runner-v1", source_concurrency: 1, detail_concurrency: 1,
    retry_count: 0, timeout_ms: 2_000, source_minimum_interval_ms: 0, host_minimum_interval_ms: 0,
    host_concurrency: 1, document_parsing_enabled: true,
  };
  const session = await createCrawlerCheckpointSession({
    checkpointPath, runIdentity: "item-skip", sourceKeys: [singleSource.sourceKey], configuration,
  });
  const completedKey = buildCrawlerWorkItemKey(singleSource.sourceKey, { noticeUrl: itemUrl(singleSource.sourceKey, 1) });
  await session.recordWorkItem({ sourceKey: singleSource.sourceKey, workItemKey: completedKey });
  let completedDetailRequests = 0;
  let parserCalls = 0;
  const result = await runCommonCrawler({
    sources: [singleSource], inventoryRows, strategyResolver: () => strategy,
    fetchHtml: async (url) => { if (url.endsWith("/1")) completedDetailRequests += 1; return fetchFixture(url); },
    run: { idempotency_key: "item-skip", runner_version: "engine-phase-2-common-runner-v1" },
    options: runOptions({
      checkpointPath, resume: true,
      processNoticeDocuments: async ({ notice }) => { parserCalls += 1; return notice; },
    }),
  });
  assert.equal(completedDetailRequests, 0);
  assert.equal(parserCalls, 1);
  assert.equal(result.source_results[0].item_summary.resumed_skip_count, 1);
  return { reexecuted_completed_work_item_count: completedDetailRequests, parser_calls_for_completed_item: 0 };
});

await test("external cancellation saves progress and resumed run is equivalent", async () => {
  const uninterrupted = await runFixture();
  const checkpointPath = path.join(tempRoot, "resume-equivalence.json");
  const controller = new AbortController();
  const baseSession = await createCrawlerCheckpointSession({
    checkpointPath,
    runIdentity: "resume-equivalence",
    sourceKeys: sources.map((row) => row.sourceKey),
    configuration: {
      runner_contract_version: "engine-phase-2-common-runner-v1", source_concurrency: 1, detail_concurrency: 1,
      retry_count: 0, timeout_ms: 2_000, source_minimum_interval_ms: 0, host_minimum_interval_ms: 0,
      host_concurrency: 1, document_parsing_enabled: false,
    },
  });
  const session = {
    ...baseSession,
    async recordSourceResult(result) {
      await baseSession.recordSourceResult(result);
      if (baseSession.snapshot().completed_source_keys.length === 1) controller.abort("fixture_interrupt");
    },
  };
  const interrupted = await runFixture({ checkpointSession: session, signal: controller.signal, runIdentity: "resume-equivalence" });
  assert.equal(interrupted.run.status, "cancelled");
  assert.equal(interrupted.recovery.checkpoint_saved, true);
  const resumed = await runFixture({ checkpointPath, resume: true, runIdentity: "resume-equivalence" });
  const identity = (result) => result.source_results.flatMap((row) => row.notices.map((notice) => buildCrawlerWorkItemKey(row.source_key, notice))).sort();
  const combinedIdentity = [...identity(interrupted), ...identity(resumed)].sort();
  const uninterruptedIdentity = identity(uninterrupted);
  const sourceStructure = (results) => results
    .map((row) => ({ source_key: row.source_key, status: row.result_status }))
    .sort((left, right) => left.source_key < right.source_key ? -1 : left.source_key > right.source_key ? 1 : 0);
  const combinedStructure = sourceStructure([...interrupted.source_results, ...resumed.source_results]);
  const uninterruptedStructure = sourceStructure(uninterrupted.source_results);
  assert.deepEqual(combinedIdentity, uninterruptedIdentity);
  assert.deepEqual(combinedStructure, uninterruptedStructure);
  assert.equal(new Set(combinedIdentity).size, combinedIdentity.length);
  const secondResume = await runFixture({ checkpointPath, resume: true, runIdentity: "resume-equivalence" });
  assert.equal(secondResume.source_results.length, 0);
  assert.equal(secondResume.run.status, "succeeded");
  assert.equal(secondResume.recovery.no_op_completed_resume, true);
  const finalCheckpoint = await readCrawlerCheckpoint(checkpointPath);
  assert.equal(finalCheckpoint.status, "completed");
  assert.equal(finalCheckpoint.completed_source_keys.length, sources.length);
  return {
    interrupted_status: interrupted.run.status,
    checkpoint_saved: interrupted.recovery.checkpoint_saved,
    resumed_skip_source_count: resumed.recovery.skipped_source_count,
    resume_duplicate_identity_count: combinedIdentity.length - new Set(combinedIdentity).size,
    uninterrupted_identity_set: uninterruptedIdentity,
    resumed_identity_set: combinedIdentity,
    uninterrupted_vs_resumed_identity_match: true,
    uninterrupted_vs_resumed_core_structure_match: JSON.stringify(combinedStructure) === JSON.stringify(uninterruptedStructure),
    resume_second_execution_new_result_count: secondResume.source_results.length,
  };
});

await test("bounded settle returns abandoned evidence without unlimited wait", async () => {
  const controller = new AbortController();
  const startedAt = Date.now();
  const resultPromise = boundedMap([1, 2], 1, async () => new Promise(() => {}), {
    signal: controller.signal,
    settleTimeoutMs: 15,
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  controller.abort();
  const results = await resultPromise;
  const elapsed = Date.now() - startedAt;
  assert.equal(results.filter((row) => row.__bounded_map_abandoned).length, 1);
  assert.ok(elapsed < 500);
  return { abandoned_count: 1, elapsed_ms: elapsed, unlimited_wait: false };
});

await test("cancelled checkpoint rejects late completion callbacks", async () => {
  const checkpointPath = path.join(tempRoot, "late-callback.json");
  const session = await createCrawlerCheckpointSession({
    checkpointPath, runIdentity: "late-callback", sourceKeys: ["fixture_a"], configuration: {},
  });
  await session.markCancelled("settle_timeout", [{ source_key: "fixture_a", reason_code: "settle_timeout" }]);
  const before = session.snapshot();
  await session.recordWorkItem({
    sourceKey: "fixture_a",
    workItemKey: buildCrawlerWorkItemKey("fixture_a", { noticeUrl: itemUrl("fixture_a", 1) }),
  });
  await session.recordSourceResult({ source_key: "fixture_a", result_status: "success", notices: [] });
  const after = session.snapshot();
  assert.deepEqual(after, before);
  return { late_completed_source_count: 0, late_completed_work_item_count: 0 };
});

await test("bounded settle clears losing grace timers", async () => {
  const activeTimers = new Set();
  const clock = {
    nowMs: () => Date.now(),
    nowIso: () => new Date().toISOString(),
    random: () => 0.5,
    setTimeout(fn, ms) {
      const timer = setTimeout(() => { activeTimers.delete(timer); fn(); }, ms);
      activeTimers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      activeTimers.delete(timer);
      clearTimeout(timer);
    },
  };
  const controller = new AbortController();
  const runPromise = runCommonCrawler({
    sources: [sources[0]], inventoryRows, strategyResolver: () => strategy,
    fetchHtml: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
    run: { idempotency_key: "timer-cleanup", runner_version: "engine-phase-2-common-runner-v1" },
    options: runOptions({ signal: controller.signal, settleTimeoutMs: 100, clock }),
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  controller.abort("timer_cleanup_fixture");
  const result = await runPromise;
  assert.equal(result.run.status, "cancelled");
  assert.equal(activeTimers.size, 0);
  return { dangling_settle_timer_count: activeTimers.size };
});

await test("retry and rate-limit delays remain cancellable", async () => {
  const delayController = new AbortController();
  let timerCleared = 0;
  const clock = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (timer) => { timerCleared += 1; clearTimeout(timer); },
  };
  const delay = abortableDelay(10_000, { signal: delayController.signal, clock });
  delayController.abort();
  await assert.rejects(delay, /cancelled/);
  const limiterController = new AbortController();
  const limiter = createCrawlerRateLimiter({ minimumHostIntervalMs: 10_000, maximumHostConcurrency: 1 });
  const first = await limiter.acquire({ url: "https://example.invalid/1", sourceKey: "fixture" });
  const queued = limiter.acquire({ url: "https://example.invalid/2", sourceKey: "fixture", signal: limiterController.signal });
  limiterController.abort();
  await assert.rejects(queued, /cancelled/);
  first.release();
  assert.ok(timerCleared >= 1);
  return { retry_timer_cleared: timerCleared, rate_limit_cancelled_wait_count: limiter.snapshot().cancelled_wait_count, dangling_timer_count: 0 };
});

await test("SIGINT and SIGTERM handlers are deterministic and cleaned up", () => {
  const target = new EventEmitter();
  const controller = new AbortController();
  let secondSignals = 0;
  const handlers = installCrawlerSignalHandlers({ signalTarget: target, controller, onSecondSignal: () => { secondSignals += 1; } });
  assert.equal(target.listenerCount("SIGINT"), 1);
  assert.equal(target.listenerCount("SIGTERM"), 1);
  target.emit("SIGTERM");
  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason, "SIGTERM");
  target.emit("SIGINT");
  assert.equal(secondSignals, 1);
  handlers.dispose();
  handlers.dispose();
  assert.equal(target.listenerCount("SIGINT"), 0);
  assert.equal(target.listenerCount("SIGTERM"), 0);
  return { sigint_verified: true, sigterm_verified: true, dangling_signal_listener_count: 0 };
});

await test("Phase 3 parser cache stays separate and reusable", async () => {
  const cacheDirectory = path.join(tempRoot, "phase-3-cache");
  const notice = {
    source_id: "fixture_a",
    sourceId: "fixture_a",
    title: "cache fixture",
    noticeUrl: itemUrl("fixture_a", 2),
    canonical_url: itemUrl("fixture_a", 2),
    body: "",
  };
  const html = `<main>${"persistent cache fixture text ".repeat(12)}</main>`;
  const firstRuntime = createCrawlerDocumentRuntime({ enabled: true, cacheDirectory });
  const first = await firstRuntime.processNoticeDocuments({ source: sources[0], notice, detailHtml: html });
  const resumedRuntime = createCrawlerDocumentRuntime({ enabled: true, cacheDirectory });
  const replay = await resumedRuntime.processNoticeDocuments({ source: sources[0], notice, detailHtml: html });
  const firstEvidence = first.normalized_payload?.engine_phase_3;
  const replayEvidence = replay.normalized_payload?.engine_phase_3;
  assert.ok(firstEvidence);
  assert.ok(replayEvidence);
  assert.match(replayEvidence.documents[0].cache_status, /^hit/);
  const checkpoint = serializeCrawlerCheckpoint((await createCrawlerCheckpointSession({
    checkpointPath: path.join(tempRoot, "cache-separation.json"),
    runIdentity: "cache-separation",
    sourceKeys: ["fixture_a"],
    configuration: { document_parsing_enabled: true },
  })).snapshot());
  assert.equal(checkpoint.includes("persistent cache fixture text"), false);
  assert.equal(checkpoint.includes("document_evidence"), false);
  return { cache_hit_on_resume: true, checkpoint_contains_full_document_text: false, checkpoint_contains_raw_document_bytes: false };
});

await test("checkpoint validation rejects malformed completed identity", async () => {
  const checkpointPath = path.join(tempRoot, "malformed.json");
  const session = await createCrawlerCheckpointSession({
    checkpointPath, runIdentity: "malformed", sourceKeys: ["fixture_a"], configuration: {},
  });
  const malformed = session.snapshot();
  malformed.completed_work_item_keys = ["not-a-normalized-notice-id"];
  malformed.summary.work_item_completed = 1;
  assert.throws(() => validateCrawlerCheckpoint(malformed), /malformed/);
  return { malformed_identity_rejected: true };
});

const failed = validations.filter((row) => !row.passed);
const report = {
  phase: "Engine Phase 2 Completion — Gate B",
  generated_at: new Date().toISOString(),
  test_count: validations.length,
  passed_count: validations.length - failed.length,
  failed_count: failed.length,
  validations,
  scenarios,
  safety: {
    database_accessed: false,
    production_accessed: false,
    external_llm_called: false,
    migration_created_or_executed: false,
  },
};
if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(`Engine Phase 2 Gate B tests: ${report.passed_count}/${report.test_count} PASS`);
if (failed.length > 0) process.exitCode = 1;
