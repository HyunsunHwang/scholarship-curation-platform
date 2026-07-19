import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommonCrawler, sanitizeCrawlerError } from "../lib/crawler-engine/common-runner.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import { buildNormalizedGraphPlan, canonicalizeNoticeUrl } from "../lib/post-phase-l/normalized-graph.mjs";
import { createSchemaValidators, validateCanonicalRecord } from "../lib/engine-phase-4/contracts.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
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
const MAX_PAGES_PER_PDF = 5;
const REQUEST_TIMEOUT_MS = 25_000;
const EXTRACTED_AT = "2026-07-19T00:00:00Z";
const cacheDirectory = path.resolve(root, `.tmp/engine-phase-4-gate-b/live-cache-${process.pid}`);
const outputArgument = process.argv.find((value) => value.startsWith("--output="));
const outputPath = path.resolve(root, outputArgument?.slice("--output=".length) ?? ".tmp/engine-phase-4-gate-b/live-summary.json");

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
  if (/\.hwp(?:x)?(?:$|[?#])/iu.test(filename)) {
    const error = new Error("Live HWP evidence is detection-only; binary download is disabled.");
    error.code = "live_hwp_detection_only";
    throw error;
  }
  if (/\.pdf(?:$|[?#])/iu.test(filename)) {
    if (pdfDownloadCount >= MAX_PDF_DOCUMENTS) {
      const error = new Error("Live PDF document limit exceeded.");
      error.code = "bounded_limit_exceeded";
      throw error;
    }
    pdfDownloadCount += 1;
  }
  return fetchCrawlerAsset(asset, { ...context, timeoutMs: REQUEST_TIMEOUT_MS });
}

function sourceNoticeFromGraph(sourceResult, notice, graph) {
  const canonicalUrl = canonicalizeNoticeUrl(notice.canonical_url ?? notice.noticeUrl ?? notice.original_url);
  const identity = graph.tables.ingestion_notices.find((row) => row.source_id === sourceResult.source_id && row.canonical_url === canonicalUrl);
  const revision = identity ? graph.tables.ingestion_notice_revisions.find((row) => row.notice_id === identity.id) : null;
  if (!identity || !revision) return null;
  return {
    source_id: identity.source_id,
    source_key_snapshot: sourceResult.source_key,
    notice_id: identity.id,
    identity_kind: identity.identity_kind,
    identity_key: identity.identity_key,
    canonical_url: identity.canonical_url,
    revision_id: revision.id,
    revision_ordinal: revision.revision_ordinal,
    parser_version: revision.parser_version,
    title: revision.title,
    body: revision.body ?? "",
    published_at: notice.notice_posted_at ?? notice.published_at ?? null,
    body_quality_status: revision.body_quality_status,
  };
}

function compactSourceResult(result) {
  return {
    source_key: result.source_key,
    final_status: result.result_status,
    notice_count: result.notices?.length ?? 0,
    error_summary: sanitizeCrawlerError(result.final_error_summary),
  };
}

if (sources.length === 0 || sources.length > 2) throw new Error("Bounded public source configuration is invalid.");
const runtime = createAuthoritativeDocumentRuntime({
  enabled: true,
  cacheDirectory,
  inspectAsset: inspectCrawlerAsset,
  fetchAsset: boundedFetchAsset,
  parserOptions: { maxBytes: 20_000_000, maxPages: MAX_PAGES_PER_PDF, maxOcrPages: 2, ocrTimeoutMs: 20_000 },
});

let run;
try {
  run = await runCommonCrawler({
    sources,
    inventoryRows,
    strategyResolver: () => strategy,
    fetchHtml: boundedFetchHtml,
    run: {
      idempotency_key: "engine-phase-4-gate-b-bounded-live",
      execution_mode: "bounded_public_http_read_only",
      runner_version: "engine-phase-4-gate-b-live-v1",
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
} finally {
  fs.rmSync(cacheDirectory, { recursive: true, force: true });
}

const graph = buildNormalizedGraphPlan(run, { generatedAt: EXTRACTED_AT });
const validators = createSchemaValidators();
const results = [];
for (const sourceResult of run.source_results) {
  for (const notice of (sourceResult.notices ?? []).slice(0, MAX_NOTICES_PER_SOURCE)) {
    const sourceNotice = sourceNoticeFromGraph(sourceResult, notice, graph);
    if (!sourceNotice) continue;
    const record = extractDeterministicScholarshipCandidate({
      sourceNotice,
      sourceDocuments: notice.document_extraction_results ?? [],
      extractionContext: {
        extractorVersion: "1.0.0",
        parserContractVersion: "engine-phase-3-document-result/v1",
        evaluationFixtureVersion: "engine-phase-4-deterministic-fixtures/v1",
        extractedAt: EXTRACTED_AT,
      },
    });
    const validation = validateCanonicalRecord(record, validators);
    results.push({
      source_key: sourceResult.source_key,
      canonical_schema_valid: validation.valid,
      evidence_reference_valid: !validation.errors.some((error) => error.code === "missing_evidence_ref"),
      review_required: record.review.required,
      classification: record.classification.document_kind,
      document_count: record.source_documents.length,
      document_formats: [...new Set(record.source_documents.map((document) => document.media_type))],
      present_field_count: Object.values(record.fields).filter((field) => field.value_status === "present").length,
      unsupported_present_value_count: Object.values(record.fields).filter((field) => field.value_status === "present" && field.evidence_refs.length === 0).length,
      automatic_publish_allowed: record.review.automatic_publish_allowed,
      notification_allowed: record.review.notification_allowed,
    });
  }
}

const report = {
  phase: "engine-phase-4-gate-b",
  task: "deterministic-extraction-baseline",
  mode: "bounded_public_http_read_only",
  generated_at: new Date().toISOString(),
  bounds: {
    source_limit: SOURCE_KEYS.length,
    notice_limit_per_source: MAX_NOTICES_PER_SOURCE,
    pdf_document_limit: MAX_PDF_DOCUMENTS,
    pdf_page_limit: MAX_PAGES_PER_PDF,
    timeout_ms: REQUEST_TIMEOUT_MS,
    retry_count: 1,
  },
  runtime_path: {
    common_runner_used: true,
    normalized_graph_used: true,
    phase_3_document_parser_enabled: true,
    deterministic_extractor_used: true,
  },
  source_results: run.source_results.map(compactSourceResult),
  summary: {
    configured_source_count: sources.length,
    observed_notice_count: run.source_results.reduce((sum, source) => sum + (source.notices?.length ?? 0), 0),
    canonical_record_count: results.length,
    schema_valid_count: results.filter((result) => result.canonical_schema_valid).length,
    evidence_valid_count: results.filter((result) => result.evidence_reference_valid).length,
    review_required_count: results.filter((result) => result.review_required).length,
    unsupported_present_value_count: results.reduce((sum, result) => sum + result.unsupported_present_value_count, 0),
    automatic_publish_allowed_count: results.filter((result) => result.automatic_publish_allowed).length,
    notification_allowed_count: results.filter((result) => result.notification_allowed).length,
  },
  records: results,
  safety: {
    database_accessed: false,
    production_accessed: false,
    production_credentials_requested: false,
    external_llm_called: false,
    raw_live_evidence_committed: false,
    raw_binary_written_to_disk: false,
  },
};
report.pass = report.summary.canonical_record_count >= 1
  && report.summary.schema_valid_count === report.summary.canonical_record_count
  && report.summary.evidence_valid_count === report.summary.canonical_record_count
  && report.summary.unsupported_present_value_count === 0
  && report.summary.automatic_publish_allowed_count === 0
  && report.summary.notification_allowed_count === 0;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`sources=${report.summary.configured_source_count}`);
console.log(`notices=${report.summary.observed_notice_count}`);
console.log(`canonical_records=${report.summary.canonical_record_count}`);
console.log(`schema_valid=${report.summary.schema_valid_count}`);
console.log(`evidence_valid=${report.summary.evidence_valid_count}`);
console.log(`ENGINE PHASE 4 GATE B LIVE: ${report.pass ? "PASS" : "FAIL"}`);
if (!report.pass) process.exitCode = 1;
