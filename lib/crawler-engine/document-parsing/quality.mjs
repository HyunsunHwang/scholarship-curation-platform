import { normalizeDocumentText } from "./contract.mjs";

export function evaluateDocumentQuality({
  text = "",
  contentBlocks = [],
  tableCount = 0,
  ocrUsed = false,
  ocrConfidence = null,
  imageCount = 0,
  parserAvailable = true,
  extractionStatus = "text_sufficient",
} = {}) {
  const normalized = normalizeDocumentText(text);
  const replacementCharacterCount = (normalized.match(/\uFFFD/g) ?? []).length;
  const nonAlphanumericCount = (normalized.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
  const nonAlphanumericRatio = normalized.length ? nonAlphanumericCount / normalized.length : 0;
  const reasons = [];
  if (!parserAvailable) reasons.push("tool_unavailable");
  if (normalized.length === 0) reasons.push(imageCount > 0 ? "image_only_detected" : "empty_text");
  else if (normalized.length < 40) reasons.push("text_too_short");
  if (replacementCharacterCount > 0) reasons.push("replacement_characters_present");
  if (nonAlphanumericRatio > 0.45) reasons.push("high_symbol_ratio");
  if (ocrUsed && Number.isFinite(Number(ocrConfidence)) && Number(ocrConfidence) < 50) reasons.push("ocr_low_confidence");
  if (contentBlocks.length === 0 && normalized.length > 0) reasons.push("structure_unavailable");

  let status = "text_sufficient";
  if (extractionStatus === "bounded_limit_exceeded") status = "bounded_limit_exceeded";
  else if (!parserAvailable) status = "tool_unavailable";
  else if (ocrUsed && reasons.includes("ocr_low_confidence")) status = "ocr_low_quality";
  else if (!normalized && imageCount > 0) status = "image_only_detected";
  else if (tableCount > 0 && normalized.length >= 40) status = "table_structure_preserved";
  else if (normalized.length < 40 || replacementCharacterCount > 0) status = "text_short_needs_review";
  else if (ocrUsed) status = "ocr_succeeded";

  const manualReview = !["text_sufficient", "table_structure_preserved", "ocr_succeeded"].includes(status);
  return {
    quality_status: status,
    quality_reasons: reasons,
    manual_review_required: manualReview,
    manual_review_reasons: manualReview ? [...reasons] : [],
    metrics: {
      normalized_text_length: normalized.length,
      replacement_character_count: replacementCharacterCount,
      non_alphanumeric_ratio: nonAlphanumericRatio,
      content_block_count: contentBlocks.length,
      table_count: tableCount,
      image_count: imageCount,
    },
  };
}
