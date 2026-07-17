import { createDocumentResult, sha256Bytes } from "./contract.mjs";
import { evaluateDocumentQuality } from "./quality.mjs";
import { createUnavailableImageOcrAdapter, recognizeImageWithTimeout } from "./image-ocr.mjs";

export const PDF_PARSER_NAME = "pdfjs-structured-text";
export const PDF_PARSER_VERSION = "1.0.0";

function pageText(items) {
  return items.map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`).join("").trim();
}

async function renderPagePng(page, scale = 1.5) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas }).promise;
  return canvas.toBuffer("image/png");
}

export function isEncryptedPdfError(error) {
  return error?.name === "PasswordException" || /password|encrypted/i.test(String(error?.message ?? error));
}

export async function parsePdfDocument(input = {}, {
  ocrAdapter = createUnavailableImageOcrAdapter(),
  maxBytes = 20_000_000,
  maxPages = 20,
  maxOcrPages = 3,
  minTextPerPage = 20,
  ocrTimeoutMs = 20_000,
} = {}) {
  const bytes = Buffer.from(input.bytes ?? "");
  const base = {
    ...input,
    bytes,
    byte_size: bytes.length,
    byte_sha256: sha256Bytes(bytes),
    detected_format: "pdf",
    detected_mime_type: "application/pdf",
    parser_name: PDF_PARSER_NAME,
    parser_version: PDF_PARSER_VERSION,
  };
  if (bytes.length > maxBytes) {
    return createDocumentResult({
      ...base,
      extraction_status: "bounded_limit_exceeded",
      quality_status: "bounded_limit_exceeded",
      quality_reasons: ["max_pdf_bytes_exceeded"],
      manual_review_reasons: ["max_pdf_bytes_exceeded"],
    });
  }
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    if (pdf.numPages > maxPages) {
      return createDocumentResult({
        ...base,
        page_count: pdf.numPages,
        extraction_status: "bounded_limit_exceeded",
        quality_status: "bounded_limit_exceeded",
        quality_reasons: ["max_pdf_pages_exceeded"],
        manual_review_reasons: ["max_pdf_pages_exceeded"],
      });
    }
    const blocks = [];
    const pageTexts = [];
    let ocrInvocationCount = 0;
    let ocrConfidenceTotal = 0;
    let ocrConfidenceCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = pageText(content.items);
      let method = "embedded_text";
      if (text.length < minTextPerPage && ocrInvocationCount < maxOcrPages && ocrAdapter.available) {
        const image = await renderPagePng(page, input.render_scale ?? 1.5);
        const recognized = await recognizeImageWithTimeout(ocrAdapter, image, { pageNumber }, ocrTimeoutMs);
        text = String(recognized.text ?? "").trim();
        method = "shared_image_ocr";
        ocrInvocationCount += 1;
        if (Number.isFinite(Number(recognized.confidence))) {
          ocrConfidenceTotal += Number(recognized.confidence);
          ocrConfidenceCount += 1;
        }
      }
      pageTexts.push(text);
      blocks.push({ type: "pdf_page", page_number: pageNumber, text, extraction_method: method, source_order: pageNumber - 1 });
    }
    const text = pageTexts.filter(Boolean).join("\n\n");
    const averageConfidence = ocrConfidenceCount ? ocrConfidenceTotal / ocrConfidenceCount : null;
    const quality = evaluateDocumentQuality({
      text,
      contentBlocks: blocks,
      ocrUsed: ocrInvocationCount > 0,
      ocrConfidence: averageConfidence,
      imageCount: pageTexts.filter((page) => !page).length,
      parserAvailable: text.length > 0 || ocrAdapter.available,
    });
    const unavailableScanned = !text && !ocrAdapter.available;
    return createDocumentResult({
      ...base,
      extraction_status: unavailableScanned ? "tool_unavailable" : quality.quality_status,
      extraction_method: ocrInvocationCount > 0 ? "pdf_text_with_shared_image_ocr" : "pdf_embedded_text",
      ocr_used: ocrInvocationCount > 0,
      ocr_engine: ocrInvocationCount > 0 ? ocrAdapter.engineName : null,
      ocr_engine_version: ocrInvocationCount > 0 ? ocrAdapter.engineVersion : null,
      ocr_invocation_count: ocrInvocationCount,
      extracted_text: text,
      content_blocks: blocks,
      page_count: pdf.numPages,
      processed_page_count: pdf.numPages,
      ...quality,
      quality_status: unavailableScanned ? "tool_unavailable" : quality.quality_status,
      manual_review_required: unavailableScanned || quality.manual_review_required,
      manual_review_reasons: unavailableScanned ? ["scanned_pdf_ocr_tool_unavailable"] : quality.manual_review_reasons,
      provenance: { ...(input.provenance ?? {}), average_ocr_confidence: averageConfidence },
    });
  } catch (error) {
    const encrypted = isEncryptedPdfError(error);
    return createDocumentResult({
      ...base,
      extraction_status: encrypted ? "encrypted_or_protected" : "parser_failed",
      extraction_method: "pdfjs",
      quality_status: "manual_review_required",
      quality_reasons: [encrypted ? "encrypted_or_protected" : "pdf_parser_failed"],
      manual_review_reasons: [encrypted ? "encrypted_or_protected" : "pdf_parser_failed"],
      error_summary: error,
    });
  }
}
