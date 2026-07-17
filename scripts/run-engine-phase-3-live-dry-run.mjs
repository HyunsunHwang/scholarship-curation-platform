import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { readSourceConfigFromCsv } from "../lib/notice-sources-loader.mjs";
import {
  classifyHwpRole,
  createDocumentParseCache,
  createDocumentParserRegistry,
  detectDocumentFormat,
} from "../lib/crawler-engine/document-parsing/index.mjs";
import { sanitizeCrawlerError } from "../lib/crawler-engine/common-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_KEYS = ["korea_002", "yonsei_001"];
const MAX_NOTICES_PER_SOURCE = 1;
const MAX_PDF_DOCUMENTS = 2;
const MAX_OCR_DOCUMENTS = 2;
const MAX_PAGES_PER_PDF = 5;
const REQUEST_TIMEOUT_MS = 25_000;
const outputArgument = process.argv.find((value) => value.startsWith("--output="));
const outputPath = path.resolve(root, outputArgument?.slice("--output=".length) ?? ".tmp/engine-phase-3/live-summary.json");

async function fetchBytes(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "user-agent": "Mozilla/5.0 EnginePhase3BoundedReadOnly/1.0" },
  });
  if (!response.ok) throw Object.assign(new Error(`Public HTTP ${response.status}`), { httpStatus: response.status });
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type")?.split(";")[0] ?? "",
  };
}

function detailCandidates(source, html) {
  const $ = load(html);
  const selector = source.listItemSelector || "a[href]";
  const rows = $(selector);
  const pattern = source.noticeUrlPattern ? new RegExp(source.noticeUrlPattern, "i") : null;
  const candidates = [];
  rows.each((_index, row) => {
    const link = source.linkSelector ? $(row).find(source.linkSelector).first() : $(row).find("a[href]").first();
    const target = link.length ? link : $(row).is("a[href]") ? $(row) : null;
    const href = target?.attr("href");
    if (!href) return;
    let resolved;
    try { resolved = new URL(href, source.baseUrl || source.listUrl).toString(); } catch { return; }
    if (pattern && !pattern.test(resolved)) return;
    if (!candidates.includes(resolved)) candidates.push(resolved);
  });
  return candidates.slice(0, MAX_NOTICES_PER_SOURCE);
}

function attachmentCandidates(detailUrl, html) {
  const $ = load(html);
  const values = [];
  $("a[href]").each((_index, link) => {
    const href = $(link).attr("href");
    if (!href) return;
    try {
      const url = new URL(href, detailUrl).toString();
      if (/\.(pdf|hwp|hwpx)(?:$|[?#])/i.test(url) && !values.includes(url)) values.push(url);
    } catch { /* malformed public link */ }
  });
  return values;
}

const sources = readSourceConfigFromCsv(path.join(root, "data/notice-sources.csv"))
  .filter((source) => SOURCE_KEYS.includes(source.sourceId));
const registry = createDocumentParserRegistry({ cache: createDocumentParseCache() });
const sourceResults = [];
let pdfDocumentCount = 0;
let ocrDocumentCount = 0;

for (const source of sources) {
  const result = { source_key: source.sourceId, status: "success", notice_count: 0, documents: [], errors: [] };
  try {
    const list = await fetchBytes(source.listUrl);
    const candidates = detailCandidates(source, list.bytes.toString("utf8"));
    for (const [noticeIndex, detailUrl] of candidates.entries()) {
      const detail = await fetchBytes(detailUrl);
      const html = detail.bytes.toString("utf8");
      const documentInput = {
        source_key: source.sourceId,
        notice_identity_reference: `bounded-live-${noticeIndex + 1}`,
        filename: "notice.html",
        mime_type: "text/html",
        html,
      };
      const documentOptions = { contentSelector: source.detailContentSelector || null };
      const parsed = await registry.parse(documentInput, documentOptions);
      const cachedReplay = await registry.parse(documentInput, documentOptions);
      result.documents.push({
        notice_ordinal: noticeIndex + 1,
        format: parsed.detected_format,
        extraction_status: parsed.extraction_status,
        quality_status: parsed.quality_status,
        manual_review_required: parsed.manual_review_required,
        byte_sha256: parsed.byte_sha256,
        normalized_text_sha256: parsed.normalized_text_sha256,
        normalized_text_length: parsed.normalized_text.length,
        table_count: parsed.table_count,
        cache_status: parsed.cache_status,
        cached_replay_status: cachedReplay.cache_status,
      });
      result.notice_count += 1;
      for (const attachmentUrl of attachmentCandidates(detailUrl, html)) {
        const formatFromName = detectDocumentFormat({ filename: new URL(attachmentUrl).pathname });
        if (formatFromName === "pdf" && pdfDocumentCount < MAX_PDF_DOCUMENTS) {
          const attachment = await fetchBytes(attachmentUrl);
          const document = await registry.parse({
            source_key: source.sourceId,
            notice_identity_reference: `bounded-live-${noticeIndex + 1}`,
            filename: `attachment-${pdfDocumentCount + 1}.pdf`,
            mime_type: attachment.mimeType || "application/pdf",
            bytes: attachment.bytes,
          }, { maxPages: MAX_PAGES_PER_PDF, maxOcrPages: MAX_OCR_DOCUMENTS - ocrDocumentCount });
          pdfDocumentCount += 1;
          ocrDocumentCount += document.ocr_used ? 1 : 0;
          result.documents.push({
            notice_ordinal: noticeIndex + 1,
            format: document.detected_format,
            extraction_status: document.extraction_status,
            quality_status: document.quality_status,
            manual_review_required: document.manual_review_required,
            byte_sha256: document.byte_sha256,
            normalized_text_sha256: document.normalized_text_sha256,
            normalized_text_length: document.normalized_text.length,
            page_count: document.page_count,
            ocr_used: document.ocr_used,
          });
        } else if (["hwp", "hwpx"].includes(formatFromName)) {
          result.documents.push({
            notice_ordinal: noticeIndex + 1,
            format: formatFromName,
            extraction_status: "capability_detected_only",
            hwp_role: classifyHwpRole({ filename: new URL(attachmentUrl).pathname, bodyText: parsed.normalized_text }),
            manual_review_required: true,
          });
        }
      }
    }
    if (result.notice_count === 0) result.status = "empty_observed";
  } catch (error) {
    result.status = "failed";
    result.errors.push(sanitizeCrawlerError(error));
  }
  sourceResults.push(result);
}

const report = {
  phase: "engine-phase-3",
  mode: "bounded_public_http_read_only",
  generated_at: new Date().toISOString(),
  bounds: {
    source_limit: SOURCE_KEYS.length,
    notice_limit_per_source: MAX_NOTICES_PER_SOURCE,
    pdf_document_limit: MAX_PDF_DOCUMENTS,
    ocr_document_limit: MAX_OCR_DOCUMENTS,
    pdf_page_limit: MAX_PAGES_PER_PDF,
    timeout_ms: REQUEST_TIMEOUT_MS,
  },
  source_results: sourceResults,
  totals: {
    source_count: sourceResults.length,
    successful_source_count: sourceResults.filter((source) => source.status === "success").length,
    failed_source_count: sourceResults.filter((source) => source.status === "failed").length,
    observed_notice_count: sourceResults.reduce((sum, source) => sum + source.notice_count, 0),
    observed_document_count: sourceResults.reduce((sum, source) => sum + source.documents.length, 0),
    html_document_count: sourceResults.flatMap((source) => source.documents).filter((document) => document.format === "html").length,
    image_document_count: sourceResults.flatMap((source) => source.documents).filter((document) => document.format === "image").length,
    hwp_document_count: sourceResults.flatMap((source) => source.documents).filter((document) => ["hwp", "hwpx"].includes(document.format)).length,
    pdf_document_count: pdfDocumentCount,
    ocr_document_count: ocrDocumentCount,
    cache_hit_count: sourceResults.flatMap((source) => source.documents).filter((document) => document.cached_replay_status?.startsWith("hit_")).length,
    cache_miss_count: sourceResults.flatMap((source) => source.documents).filter((document) => document.cache_status === "miss").length,
    manual_review_count: sourceResults.flatMap((source) => source.documents).filter((document) => document.manual_review_required).length,
  },
  safety: {
    database_read_performed: false,
    database_write_performed: false,
    production_access_performed: false,
    external_llm_call_count: 0,
    raw_document_written_to_disk: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`sources=${report.totals.source_count}`);
console.log(`notices=${report.totals.observed_notice_count}`);
console.log(`documents=${report.totals.observed_document_count}`);
console.log(`pdf_documents=${report.totals.pdf_document_count}`);
console.log(`ocr_documents=${report.totals.ocr_document_count}`);
console.log(`output=${outputPath}`);
