import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCrawlerWorkItemKey, createCrawlerCheckpointSession } from "../lib/crawler-engine/checkpoint.mjs";
import { runCommonCrawler, sanitizeCrawlerError } from "../lib/crawler-engine/common-runner.mjs";
import { createCrawlerRateLimiter } from "../lib/crawler-engine/execution-policy.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import { readSourceConfigFromCsv } from "../lib/notice-sources-loader.mjs";
import {
  createAuthoritativeDocumentRuntime,
  extractFromList,
  fetchHtml,
} from "./crawl-scholarship-notices.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_KEYS = ["korea_002", "yonsei_001"];
const TIMEOUT_MS = 25_000;
const tempDirectory = path.resolve(root, ".tmp/engine-phase-2-gate-b/live");
const checkpointPath = path.join(tempDirectory, "checkpoint.json");
const cacheDirectory = path.join(tempDirectory, "document-cache");
const outputArgument = process.argv.find((value) => value.startsWith("--output="));
const outputPath = path.resolve(root, outputArgument?.slice("--output=".length) ?? ".tmp/engine-phase-2-gate-b/live-summary.json");
const sources = readSourceConfigFromCsv(path.join(root, "data/notice-sources.csv"))
  .filter((source) => SOURCE_KEYS.includes(source.sourceId));
const inventoryRows = sources.map((source) => ({ source_id: source.sourceId }));
const strategy = createGenericHtmlStrategy({ parseListHtml: extractFromList });
const htmlCache = new Map();

async function boundedFetchHtml(url, options = {}) {
  if (htmlCache.has(url)) return htmlCache.get(url);
  const html = await fetchHtml(url, { ...options, retryCount: 0, timeoutMs: TIMEOUT_MS });
  htmlCache.set(url, html);
  return html;
}

function runtimeOptions(requestLimiter, documentRuntime, extra = {}) {
  return {
    maxItems: 1,
    fetchDetails: true,
    timeoutMs: TIMEOUT_MS,
    retryCount: 0,
    retryBackoffMs: 1_000,
    maximumRetryDelayMs: 5_000,
    retryJitterRatio: 0,
    sourceConcurrency: 1,
    detailConcurrency: 1,
    minimumSourceIntervalMs: 100,
    minimumHostIntervalMs: 150,
    maximumHostConcurrency: 1,
    settleTimeoutMs: 2_000,
    requestLimiter,
    processNoticeDocuments: documentRuntime.processNoticeDocuments,
    ...extra,
  };
}

function checkpointConfiguration() {
  return {
    runner_contract_version: "engine-phase-2-common-runner-v1",
    source_concurrency: 1,
    detail_concurrency: 1,
    retry_count: 0,
    retry_backoff_ms: 1_000,
    retry_maximum_delay_ms: 5_000,
    retry_jitter_ratio: 0,
    timeout_ms: TIMEOUT_MS,
    source_minimum_interval_ms: 100,
    host_minimum_interval_ms: 150,
    host_concurrency: 1,
    fetch_details: true,
    document_parsing_enabled: true,
    maximum_items_per_source: 1,
  };
}

async function execute(extraOptions = {}) {
  const requestLimiter = createCrawlerRateLimiter({
    minimumSourceIntervalMs: 100,
    minimumHostIntervalMs: 150,
    maximumHostConcurrency: 1,
  });
  const documentRuntime = createAuthoritativeDocumentRuntime({
    enabled: true,
    cacheDirectory,
    requestLimiter,
    parserOptions: { maxBytes: 20_000_000, maxPages: 5, maxOcrPages: 2, ocrTimeoutMs: 20_000 },
  });
  return runCommonCrawler({
    sources,
    inventoryRows,
    strategyResolver: () => strategy,
    fetchHtml: boundedFetchHtml,
    run: {
      idempotency_key: "engine-phase-2-gate-b-live",
      execution_mode: "bounded_public_http_read_only",
      runner_version: "engine-phase-2-common-runner-v1",
    },
    options: runtimeOptions(requestLimiter, documentRuntime, extraOptions),
  });
}

function compact(result) {
  return {
    status: result.run.status,
    source_count: result.source_results.length,
    notice_count: result.source_results.reduce((sum, row) => sum + (row.notices?.length ?? 0), 0),
    document_count: result.source_results.reduce((sum, row) => sum + (row.notices ?? []).reduce(
      (noticeSum, notice) => noticeSum + (notice.document_extraction_results?.length ?? 0), 0,
    ), 0),
    error_count: result.source_results.filter((row) => !["success", "empty_observed", "partial"].includes(row.result_status)).length,
    recovery: result.recovery,
    errors: result.source_results.map((row) => sanitizeCrawlerError(row.final_error_summary)).filter(Boolean),
  };
}

function identities(result) {
  return result.source_results.flatMap((row) => (row.notices ?? [])
    .map((notice) => buildCrawlerWorkItemKey(row.source_key, notice))
    .filter(Boolean));
}

fs.rmSync(tempDirectory, { recursive: true, force: true });
fs.mkdirSync(tempDirectory, { recursive: true });
let interrupted;
let resumed;
let finalCheckpoint;
try {
  const controller = new AbortController();
  const baseSession = await createCrawlerCheckpointSession({
    checkpointPath,
    runIdentity: "engine-phase-2-gate-b-live",
    sourceKeys: SOURCE_KEYS,
    configuration: checkpointConfiguration(),
  });
  const session = {
    ...baseSession,
    async recordSourceResult(result) {
      await baseSession.recordSourceResult(result);
      if (baseSession.snapshot().completed_source_keys.length === 1) controller.abort("bounded_live_interrupt");
    },
  };
  interrupted = await execute({ checkpointSession: session, signal: controller.signal });
  resumed = await execute({ checkpointPath, resume: true });
  finalCheckpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
} finally {
  fs.rmSync(cacheDirectory, { recursive: true, force: true });
}

const combinedIdentities = [...identities(interrupted), ...identities(resumed)];
const duplicateIdentityCount = combinedIdentities.length - new Set(combinedIdentities).size;
const report = {
  phase: "Engine Phase 2 Completion — Gate B",
  mode: "bounded_public_http_read_only",
  generated_at: new Date().toISOString(),
  source_keys: SOURCE_KEYS,
  bounds: {
    source_count: sources.length,
    notice_limit_per_source: 1,
    source_concurrency: 1,
    detail_concurrency: 1,
    host_concurrency: 1,
    retry_count: 0,
    timeout_ms: TIMEOUT_MS,
  },
  runtime_path: {
    common_runner_used: true,
    gate_a_limiter_reused: true,
    external_abort_controller_used: true,
    checkpoint_local_file_used: true,
    explicit_resume_used: true,
    parallel_runner_created: false,
  },
  interrupted: compact(interrupted),
  resumed: compact(resumed),
  invariants: {
    interrupted_cancelled: interrupted.run.status === "cancelled",
    cancellation_checkpoint_saved: interrupted.recovery?.checkpoint_saved === true,
    final_checkpoint_completed: finalCheckpoint.status === "completed",
    completed_source_count: finalCheckpoint.completed_source_keys.length,
    completed_work_item_count: finalCheckpoint.completed_work_item_keys.length,
    resumed_skipped_source_count: resumed.recovery?.skipped_source_count ?? 0,
    duplicate_identity_count: duplicateIdentityCount,
  },
  safety: {
    database_read_performed: false,
    database_write_performed: false,
    production_access_performed: false,
    migration_performed: false,
    external_llm_call_count: 0,
    full_source_run_performed: false,
    raw_checkpoint_committed: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.rmSync(checkpointPath, { force: true });
console.log(`sources=${sources.length}`);
console.log(`interrupted_status=${report.interrupted.status}`);
console.log(`resumed_status=${report.resumed.status}`);
console.log(`resumed_skipped_sources=${report.invariants.resumed_skipped_source_count}`);
console.log(`duplicate_identity_count=${duplicateIdentityCount}`);
console.log(`output=${outputPath}`);
