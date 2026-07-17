import crypto from "node:crypto";
import { sanitizeCrawlerError } from "../common-runner.mjs";

export const DOCUMENT_PARSING_CONTRACT_VERSION = "engine-phase-3-document-result/v1";
export const DOCUMENT_NORMALIZATION_VERSION = "document-text-normalization/v1";

export const DOCUMENT_EXTRACTION_STATUSES = Object.freeze([
  "text_sufficient",
  "text_short_needs_review",
  "table_structure_preserved",
  "image_only_detected",
  "ocr_succeeded",
  "ocr_low_quality",
  "attachment_primary_content",
  "hwp_only_primary_document",
  "tool_unavailable",
  "unsupported_format",
  "parser_failed",
  "download_failed",
  "encrypted_or_protected",
  "bounded_limit_exceeded",
  "manual_review_required",
]);

export function sha256Bytes(value) {
  return crypto.createHash("sha256").update(Buffer.from(value ?? "")).digest("hex");
}

export function normalizeDocumentText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizedTextSha256(value) {
  return sha256Bytes(normalizeDocumentText(value));
}

export function boundedDocumentError(value) {
  return sanitizeCrawlerError(value);
}

export function createDocumentResult(input = {}) {
  const extractedText = String(input.extracted_text ?? "");
  const normalizedText = normalizeDocumentText(extractedText);
  return {
    contract_version: DOCUMENT_PARSING_CONTRACT_VERSION,
    document_id: input.document_id ?? null,
    source_key: input.source_key ?? null,
    source_id: input.source_id ?? null,
    notice_identity_reference: input.notice_identity_reference ?? null,
    original_url: input.original_url ?? null,
    canonical_url: input.canonical_url ?? null,
    filename: input.filename ?? null,
    detected_format: input.detected_format ?? "unknown",
    detected_mime_type: input.detected_mime_type ?? "application/octet-stream",
    byte_size: Number(input.byte_size) || 0,
    byte_sha256: input.byte_sha256 ?? sha256Bytes(input.bytes ?? ""),
    extraction_status: input.extraction_status ?? "parser_failed",
    extraction_method: input.extraction_method ?? "none",
    parser_name: input.parser_name ?? "unknown",
    parser_version: input.parser_version ?? "unknown",
    ocr_used: input.ocr_used === true,
    ocr_engine: input.ocr_engine ?? null,
    ocr_engine_version: input.ocr_engine_version ?? null,
    ocr_invocation_count: Number(input.ocr_invocation_count) || 0,
    ocr_eligible_page_count: Number(input.ocr_eligible_page_count) || 0,
    ocr_processed_page_count: Number(input.ocr_processed_page_count) || 0,
    ocr_skipped_page_count: Number(input.ocr_skipped_page_count) || 0,
    cache_status: input.cache_status ?? "bypassed",
    cache_key: input.cache_key ?? null,
    cache_hit: input.cache_hit === true,
    reparsed: input.reparsed === true,
    reparse_reason: input.reparse_reason ?? null,
    extracted_text: extractedText,
    normalized_text: normalizedText,
    normalized_text_sha256: normalizedTextSha256(normalizedText),
    content_blocks: Array.isArray(input.content_blocks) ? input.content_blocks : [],
    table_count: Number(input.table_count) || 0,
    page_count: Number(input.page_count) || 0,
    processed_page_count: Number(input.processed_page_count) || 0,
    quality_status: input.quality_status ?? "manual_review_required",
    quality_reasons: Array.isArray(input.quality_reasons) ? input.quality_reasons : [],
    manual_review_required: input.manual_review_required !== false,
    manual_review_reasons: Array.isArray(input.manual_review_reasons) ? input.manual_review_reasons : [],
    metrics: input.metrics ?? {},
    error_summary: boundedDocumentError(input.error_summary),
    provenance: input.provenance ?? {},
  };
}
