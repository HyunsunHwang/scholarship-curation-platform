import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommonCrawler } from "../lib/crawler-engine/common-runner.mjs";
import { sanitizeCrawlerError } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
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
const SOURCE_CONCURRENCY = 2;
const DETAIL_CONCURRENCY = 2;
const HOST_CONCURRENCY = 1;
const SOURCE_INTERVAL_MS = 150;
const HOST_INTERVAL_MS = 200;
const TIMEOUT_MS = 25_000;
const cacheDirectory = path.resolve(root, ".tmp/engine-phase-2-gate-a/document-cache");
const outputArgument = process.argv.find((value) => value.startsWith("--output="));
const outputPath = path.resolve(root, outputArgument?.slice("--output=".length) ?? ".tmp/engine-phase-2-gate-a/live-summary.json");
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

function compactSource(result) {
  return {
    source_key: result.source_key,
    final_status: result.result_status,
    notice_count: result.notices?.length ?? 0,
    attempt_count: result.total_attempt_count,
    failed_item_count: result.item_summary?.failed_count ?? 0,
    cancelled_item_count: result.item_summary?.cancelled_count ?? 0,
    document_count: (result.notices ?? []).reduce((sum, notice) => sum + (notice.document_extraction_results?.length ?? 0), 0),
    error_summary: sanitizeCrawlerError(result.final_error_summary),
  };
}

async function runPass(label, documentParsingEnabled) {
  const requestLimiter = createCrawlerRateLimiter({
    minimumSourceIntervalMs: SOURCE_INTERVAL_MS,
    minimumHostIntervalMs: HOST_INTERVAL_MS,
    maximumHostConcurrency: HOST_CONCURRENCY,
  });
  const documentRuntime = createAuthoritativeDocumentRuntime({
    enabled: documentParsingEnabled,
    cacheDirectory,
    requestLimiter,
    parserOptions: { maxBytes: 20_000_000, maxPages: 5, maxOcrPages: 2, ocrTimeoutMs: 20_000 },
  });
  const result = await runCommonCrawler({
    sources,
    inventoryRows,
    strategyResolver: () => strategy,
    fetchHtml: boundedFetchHtml,
    run: {
      idempotency_key: `engine-phase-2-gate-a-${label}`,
      execution_mode: "bounded_public_http_read_only",
      runner_version: "engine-phase-2-gate-a-v1",
      metadata: { source_keys: SOURCE_KEYS, document_parsing_enabled: documentParsingEnabled },
    },
    options: {
      maxItems: 1,
      fetchDetails: true,
      timeoutMs: TIMEOUT_MS,
      retryCount: 1,
      retryBackoffMs: 1_000,
      maximumRetryDelayMs: 5_000,
      retryJitterRatio: 0.1,
      sourceConcurrency: SOURCE_CONCURRENCY,
      detailConcurrency: DETAIL_CONCURRENCY,
      requestLimiter,
      processNoticeDocuments: documentRuntime.processNoticeDocuments,
    },
  });
  return {
    source_results: result.source_results.map(compactSource),
    overall_status: result.run_summary.overall_run_status,
    notice_count: result.source_results.reduce((sum, sourceResult) => sum + (sourceResult.notices?.length ?? 0), 0),
    document_count: result.source_results.reduce((sum, sourceResult) => sum + (sourceResult.notices ?? []).reduce((noticeSum, notice) => noticeSum + (notice.document_extraction_results?.length ?? 0), 0), 0),
    error_count: result.source_results.filter((sourceResult) => !["success", "empty_observed", "partial"].includes(sourceResult.result_status)).length,
    maximum_observed_host_concurrency: result.execution_policy.rate_limit.maximum_observed_host_concurrency,
    rate_limit_request_count: result.execution_policy.rate_limit.request_count,
    cancelled_wait_count: result.execution_policy.rate_limit.cancelled_wait_count,
  };
}

fs.rmSync(cacheDirectory, { recursive: true, force: true });
let disabled;
let enabled;
try {
  disabled = await runPass("disabled", false);
  enabled = await runPass("enabled", true);
} finally {
  fs.rmSync(cacheDirectory, { recursive: true, force: true });
}

const report = {
  phase: "Engine Phase 2 Completion — Gate A",
  mode: "bounded_public_http_read_only",
  generated_at: new Date().toISOString(),
  source_keys: SOURCE_KEYS,
  bounds: {
    source_count: sources.length,
    notice_limit_per_source: 1,
    source_concurrency: SOURCE_CONCURRENCY,
    detail_concurrency: DETAIL_CONCURRENCY,
    host_concurrency: HOST_CONCURRENCY,
    source_minimum_interval_ms: SOURCE_INTERVAL_MS,
    host_minimum_interval_ms: HOST_INTERVAL_MS,
    retry_count: 1,
    timeout_ms: TIMEOUT_MS,
  },
  runtime_path: {
    common_runner_used: true,
    shared_rate_limiter_used: true,
    parallel_runner_created: false,
    checkpoint_or_resume_used: false,
  },
  document_parsing_disabled: disabled,
  document_parsing_enabled: enabled,
  safety: {
    database_read_performed: false,
    database_write_performed: false,
    production_access_performed: false,
    migration_performed: false,
    external_llm_call_count: 0,
    raw_binary_written_to_disk: false,
    checkpoint_written: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`sources=${report.bounds.source_count}`);
console.log(`disabled_notices=${disabled.notice_count}`);
console.log(`enabled_notices=${enabled.notice_count}`);
console.log(`enabled_documents=${enabled.document_count}`);
console.log(`output=${outputPath}`);
