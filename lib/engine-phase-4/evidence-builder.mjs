import { sha256 } from "../post-phase-l/normalized-graph.mjs";
import { normalizeWhitespace } from "./deterministic-normalizers.mjs";

export const DETERMINISTIC_EXTRACTOR_NAME = "engine-phase-4-deterministic-baseline";
export const DETERMINISTIC_EXTRACTOR_VERSION = "1.0.0";

function compactLocator(locator = {}) {
  return {
    page_number: locator.page_number ?? null,
    section: locator.section ?? null,
    html_selector: locator.html_selector ?? null,
    attribute_name: locator.attribute_name ?? null,
    text_span: locator.text_span ?? null,
    table_coordinates: locator.table_coordinates ?? null,
    bounding_box: locator.bounding_box ?? null,
  };
}

function deterministicEvidenceId(input) {
  const key = JSON.stringify({
    notice: input.sourceNoticeId ?? null,
    revision: input.documentRevisionId ?? input.noticeRevisionId ?? null,
    sourceType: input.sourceType,
    locator: compactLocator(input.locator),
    text: normalizeWhitespace(input.text),
    role: input.role,
  });
  return `ev_${sha256(key).slice(0, 24)}`;
}

export function createEvidenceCollector({ sourceNotice, extractionContext }) {
  const evidence = new Map();
  const createdAt = extractionContext.extractedAt;
  const extractorVersion = extractionContext.extractorVersion ?? DETERMINISTIC_EXTRACTOR_VERSION;

  function add({ segment, text, role, locator = null, sourceType = null }) {
    const rawText = normalizeWhitespace(text ?? segment?.text).slice(0, 4000);
    if (!rawText) throw new Error(`Evidence text is required for ${role}`);
    const resolvedLocator = compactLocator(locator ?? segment?.locator ?? {});
    if (resolvedLocator.text_span === null && segment?.text) {
      const start = Math.max(0, normalizeWhitespace(segment.text).indexOf(rawText));
      resolvedLocator.text_span = { start, end: start + rawText.length };
    }
    const resolvedSourceType = sourceType ?? segment?.source_type ?? "html_text";
    const document = segment?.document ?? null;
    const evidenceId = deterministicEvidenceId({
      sourceNoticeId: sourceNotice.notice_id,
      noticeRevisionId: sourceNotice.revision_id,
      documentRevisionId: document?.document_revision_id,
      sourceType: resolvedSourceType,
      locator: resolvedLocator,
      text: rawText,
      role,
    });
    if (!evidence.has(evidenceId)) {
      evidence.set(evidenceId, {
        evidence_id: evidenceId,
        source_type: resolvedSourceType,
        source_notice_id: sourceNotice.notice_id,
        document_id: document?.document_id ?? null,
        document_revision_id: document?.document_revision_id ?? null,
        document_hash: document?.document_hash ?? null,
        attachment_url: document?.attachment_url ?? null,
        locator: resolvedLocator,
        raw_text: rawText,
        normalized_text: normalizeWhitespace(rawText),
        extractor: {
          name: DETERMINISTIC_EXTRACTOR_NAME,
          version: extractorVersion,
          kind: "deterministic",
          model_provider: null,
          model_name: null,
          prompt_version: null,
        },
        parser_version: document?.parser_version ?? sourceNotice.parser_version ?? "normalized-source-notice/v1",
        inference_reason: null,
        manual_annotation_id: null,
        created_at: createdAt,
      });
    }
    return evidenceId;
  }

  return { add, values: () => [...evidence.values()] };
}

export function sourceTypeForDocument(document, block = {}) {
  if (document.detected_format === "pdf" && block.type === "table") return "pdf_table_cell";
  if (document.detected_format === "pdf") return document.ocr_used || block.type === "ocr_text" ? "ocr_text" : "pdf_text";
  if (document.detected_format === "hwp") return "hwp_text";
  if (document.detected_format === "hwpx") return "hwpx_text";
  if (document.detected_format === "image") return "ocr_text";
  if (block.type === "table") return "html_table_cell";
  return "html_text";
}
