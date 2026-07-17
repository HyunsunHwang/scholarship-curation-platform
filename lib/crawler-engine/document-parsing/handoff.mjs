import { DOCUMENT_PARSING_CONTRACT_VERSION } from "./contract.mjs";

const DOCUMENT_EVIDENCE_FIELDS = [
  "document_id",
  "original_url",
  "canonical_url",
  "filename",
  "detected_format",
  "detected_mime_type",
  "byte_size",
  "byte_sha256",
  "normalized_text_sha256",
  "extraction_status",
  "quality_status",
  "quality_reasons",
  "manual_review_required",
  "manual_review_reasons",
  "parser_name",
  "parser_version",
  "ocr_used",
  "ocr_engine",
  "ocr_engine_version",
  "ocr_invocation_count",
  "ocr_eligible_page_count",
  "ocr_processed_page_count",
  "ocr_skipped_page_count",
  "cache_status",
];

function compactDocumentEvidence(document = {}) {
  return Object.fromEntries(DOCUMENT_EVIDENCE_FIELDS.map((field) => [field, document[field] ?? null]));
}

export function buildEnginePhase3Payload(notice = {}) {
  const documents = Array.isArray(notice.document_extraction_results)
    ? notice.document_extraction_results.map(compactDocumentEvidence)
    : [];
  return {
    contract_version: DOCUMENT_PARSING_CONTRACT_VERSION,
    document_count: documents.length,
    manual_review_count: documents.filter((document) => document.manual_review_required === true).length,
    ocr_invocation_count: documents.reduce((sum, document) => sum + (Number(document.ocr_invocation_count) || 0), 0),
    documents,
  };
}

export function attachEnginePhase3Payload(notice = {}) {
  const existing = notice.normalized_payload && typeof notice.normalized_payload === "object"
    ? notice.normalized_payload
    : {};
  return {
    ...notice,
    normalized_payload: {
      ...existing,
      engine_phase_3: buildEnginePhase3Payload(notice),
    },
  };
}

export function summarizeNoticeDocumentEvidence(notice = {}) {
  const documents = Array.isArray(notice.document_extraction_results) ? notice.document_extraction_results : [];
  const formats = [...new Set(documents.map((document) => document.detected_format).filter(Boolean))];
  const statuses = [...new Set(documents.map((document) => document.extraction_status).filter(Boolean))];
  return {
    document_count: documents.length,
    document_formats: formats,
    extraction_statuses: statuses,
    manual_review_count: documents.filter((document) => document.manual_review_required).length,
    ocr_invocation_count: documents.reduce((sum, document) => sum + (Number(document.ocr_invocation_count) || 0), 0),
    byte_fingerprint_count: documents.filter((document) => /^[a-f0-9]{64}$/.test(document.byte_sha256 ?? "")).length,
    normalized_text_fingerprint_count: documents.filter((document) => /^[a-f0-9]{64}$/.test(document.normalized_text_sha256 ?? "")).length,
    cache_hit_count: documents.filter((document) => document.cache_hit === true).length,
    cache_miss_count: documents.filter((document) => document.cache_status === "miss").length,
  };
}
