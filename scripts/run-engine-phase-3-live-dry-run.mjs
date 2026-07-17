import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommonCrawler, sanitizeCrawlerError } from "../lib/crawler-engine/common-runner.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import { summarizeNoticeDocumentEvidence } from "../lib/crawler-engine/document-parsing/index.mjs";
import { readSourceConfigFromCsv } from "../lib/notice-sources-loader.mjs";
import {
  createAuthoritativeDocumentRuntime,
  extractFromList,
  fetchCrawlerAsset,
  fetchHtml,
  inspectCrawlerAsset,
} from "./crawl-scholarship-notices.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_KEYS = ["korea_002", "yonsei_001"];
const MAX_NOTICES_PER_SOURCE = 1;
const MAX_PDF_DOCUMENTS = 2;
const MAX_OCR_DOCUMENTS = 2;
const MAX_PAGES_PER_PDF = 5;
const REQUEST_TIMEOUT_MS = 25_000;
const cacheDirectory = path.resolve(root, ".tmp/engine-phase-3/live-cache");
const outputArgument = process.argv.find((value) => value.startsWith("--output="));
const outputPath = path.resolve(root, outputArgument?.slice("--output=".length) ?? ".tmp/engine-phase-3/live-summary.json");

const sources = readSourceConfigFromCsv(path.join(root, "data/notice-sources.csv"))
  .filter((source) => SOURCE_KEYS.includes(source.sourceId));
const inventoryRows = sources.map((source) => ({ source_id: source.sourceId }));
const strategy = createGenericHtmlStrategy({ parseListHtml: extractFromList });
const htmlResponses = new Map();
let pdfDownloadCount = 0;

async function boundedFetchHtml(url, options = {}) {
  if (htmlResponses.has(url)) return htmlResponses.get(url);
  const html = await fetchHtml(url, { ...options, retryCount: 0, timeoutMs: REQUEST_TIMEOUT_MS });
  htmlResponses.set(url, html);
  return html;
}

async function boundedFetchAsset(asset, context = {}) {
  const filename = String(asset.fileName ?? asset.filename ?? asset.url ?? "");
  if (/\.hwp(?:x)?(?:$|[?#])/i.test(filename)) {
    const error = new Error("Live HWP evidence is detection-only; binary download is disabled.");
    error.code = "live_hwp_detection_only";
    throw error;
  }
  if (/\.pdf(?:$|[?#])/i.test(filename)) {
    if (pdfDownloadCount >= MAX_PDF_DOCUMENTS) {
      const error = new Error("Live PDF document limit exceeded.");
      error.code = "bounded_limit_exceeded";
      throw error;
    }
    pdfDownloadCount += 1;
  }
  return fetchCrawlerAsset(asset, { ...context, timeoutMs: REQUEST_TIMEOUT_MS });
}

function createRuntime() {
  return createAuthoritativeDocumentRuntime({
    enabled: true,
    cacheDirectory,
    inspectAsset: inspectCrawlerAsset,
    fetchAsset: boundedFetchAsset,
    parserOptions: {
      maxBytes: 20_000_000,
      maxPages: MAX_PAGES_PER_PDF,
      maxOcrPages: MAX_OCR_DOCUMENTS,
      ocrTimeoutMs: 20_000,
    },
  });
}

async function runPass(label, runtime) {
  return runCommonCrawler({
    sources,
    inventoryRows,
    strategyResolver: () => strategy,
    fetchHtml: boundedFetchHtml,
    run: {
      idempotency_key: `engine-phase-3-live-${label}`,
      execution_mode: "bounded_public_http_read_only",
      runner_version: "engine-phase-3-common-runner-v1",
      metadata: { source_keys: SOURCE_KEYS, document_parsing_enabled: true },
    },
    options: {
      maxItems: MAX_NOTICES_PER_SOURCE,
      fetchDetails: true,
      timeoutMs: REQUEST_TIMEOUT_MS,
      retryCount: 1,
      retryBackoffMs: 1_000,
      processNoticeDocuments: runtime.processNoticeDocuments,
    },
  });
}

function compactSourceResult(result) {
  const notices = (result.notices ?? []).map((notice, index) => ({
    notice_ordinal: index + 1,
    document_evidence: summarizeNoticeDocumentEvidence(notice),
    documents: (notice.document_extraction_results ?? []).map((document) => ({
      format: document.detected_format,
      extraction_status: document.extraction_status,
      quality_status: document.quality_status,
      manual_review_required: document.manual_review_required,
      byte_fingerprint_present: /^[a-f0-9]{64}$/.test(document.byte_sha256 ?? ""),
      normalized_text_fingerprint_present: /^[a-f0-9]{64}$/.test(document.normalized_text_sha256 ?? ""),
      cache_status: document.cache_status,
      ocr_invocation_count: document.ocr_invocation_count,
    })),
  }));
  return {
    source_key: result.source_key,
    strategy: result.strategy,
    final_status: result.result_status,
    attempt_count: result.total_attempt_count,
    notice_count: result.notices?.length ?? 0,
    notices,
    error_summary: sanitizeCrawlerError(result.final_error_summary),
  };
}

function allDocuments(run) {
  return run.source_results.flatMap((source) =>
    (source.notices ?? []).flatMap((notice) => notice.document_extraction_results ?? []));
}

fs.rmSync(cacheDirectory, { recursive: true, force: true });
let firstRun;
let replayRun;
let firstRuntime;
let replayRuntime;
try {
  firstRuntime = createRuntime();
  firstRun = await runPass("first", firstRuntime);
  pdfDownloadCount = 0;
  replayRuntime = createRuntime();
  replayRun = await runPass("replay", replayRuntime);
} finally {
  // Parser cache payloads are transient runtime state, never committed evidence.
  fs.rmSync(cacheDirectory, { recursive: true, force: true });
}

const firstDocuments = allDocuments(firstRun);
const replayDocuments = allDocuments(replayRun);
const report = {
  phase: "engine-phase-3-remediation",
  mode: "bounded_public_http_read_only",
  generated_at: new Date().toISOString(),
  runtime_path: {
    common_runner_used: true,
    generic_html_strategy_used: true,
    document_processor_enabled: true,
    standalone_list_or_detail_parser_used: false,
    persistent_file_cache_used: true,
  },
  bounds: {
    source_limit: SOURCE_KEYS.length,
    notice_limit_per_source: MAX_NOTICES_PER_SOURCE,
    pdf_document_limit: MAX_PDF_DOCUMENTS,
    ocr_document_limit: MAX_OCR_DOCUMENTS,
    pdf_page_limit: MAX_PAGES_PER_PDF,
    timeout_ms: REQUEST_TIMEOUT_MS,
    retry_count: 1,
  },
  first_run: {
    source_results: firstRun.source_results.map(compactSourceResult),
    overall_status: firstRun.run_summary.overall_run_status,
    document_count: firstDocuments.length,
    cache_miss_count: firstDocuments.filter((document) => document.cache_status === "miss").length,
    parser_invocation_count: firstRuntime.registry.parserInvocationCount,
  },
  replay_run: {
    source_results: replayRun.source_results.map(compactSourceResult),
    overall_status: replayRun.run_summary.overall_run_status,
    document_count: replayDocuments.length,
    cache_hit_count: replayDocuments.filter((document) => document.cache_status === "hit_success").length,
    parser_invocation_count: replayRuntime.registry.parserInvocationCount,
  },
  totals: {
    source_count: sources.length,
    notice_count: firstRun.source_results.reduce((sum, source) => sum + (source.notices?.length ?? 0), 0),
    html_document_count: firstDocuments.filter((document) => document.detected_format === "html").length,
    pdf_document_count: firstDocuments.filter((document) => document.detected_format === "pdf").length,
    image_document_count: firstDocuments.filter((document) => document.detected_format === "image").length,
    hwp_document_count: firstDocuments.filter((document) => ["hwp", "hwpx"].includes(document.detected_format)).length,
    ocr_invocation_count: firstDocuments.reduce((sum, document) => sum + (Number(document.ocr_invocation_count) || 0), 0),
    manual_review_count: firstDocuments.filter((document) => document.manual_review_required).length,
    error_count: firstRun.source_results.filter((source) => !["success", "empty_observed"].includes(source.result_status)).length,
  },
  safety: {
    database_read_performed: false,
    database_write_performed: false,
    production_access_performed: false,
    external_llm_call_count: 0,
    raw_binary_written_to_disk: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`sources=${report.totals.source_count}`);
console.log(`notices=${report.totals.notice_count}`);
console.log(`documents=${report.first_run.document_count}`);
console.log(`first_cache_misses=${report.first_run.cache_miss_count}`);
console.log(`replay_cache_hits=${report.replay_run.cache_hit_count}`);
console.log(`output=${outputPath}`);
