import { createDocumentResult, sha256Bytes } from "./contract.mjs";
import { evaluateDocumentQuality } from "./quality.mjs";

export const IMAGE_OCR_PARSER_NAME = "shared-image-ocr";
export const IMAGE_OCR_PARSER_VERSION = "1.0.0";

export function createImageOcrAdapter({
  recognize,
  engineName = "injected-ocr",
  engineVersion = "fixture",
  available = true,
} = {}) {
  return {
    available: available && typeof recognize === "function",
    engineName,
    engineVersion,
    async recognize(bytes, options = {}) {
      if (!this.available) return { status: "tool_unavailable", text: "", confidence: null };
      return recognize(Buffer.from(bytes), options);
    },
  };
}

export function createUnavailableImageOcrAdapter(reason = "ocr_tool_unavailable") {
  return {
    available: false,
    engineName: "unavailable",
    engineVersion: "unavailable",
    async recognize() {
      return { status: "tool_unavailable", text: "", confidence: null, reason };
    },
  };
}

export function createTesseractImageOcrAdapter({ languages = "kor+eng", workerOptions = {} } = {}) {
  let workerPromise = null;
  const getWorker = async () => {
    if (!workerPromise) {
      workerPromise = import("tesseract.js")
        .then(({ createWorker }) => createWorker(languages, undefined, workerOptions));
    }
    return workerPromise;
  };
  return {
    available: true,
    engineName: "tesseract.js",
    engineVersion: "7",
    async recognize(bytes) {
      const worker = await getWorker();
      const { data } = await worker.recognize(Buffer.from(bytes));
      return { status: "success", text: data.text ?? "", confidence: data.confidence ?? null };
    },
    async terminate() {
      if (workerPromise) await (await workerPromise).terminate();
      workerPromise = null;
    },
  };
}

export async function recognizeImageWithTimeout(ocrAdapter, bytes, options = {}, timeoutMs = 20_000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("OCR invocation timed out.");
      error.name = "AbortError";
      error.code = "ocr_timeout";
      reject(error);
    }, Math.max(1, Number(timeoutMs) || 20_000));
  });
  try {
    return await Promise.race([ocrAdapter.recognize(bytes, options), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function parseImageDocument(input = {}, {
  ocrAdapter = createUnavailableImageOcrAdapter(),
  maxBytes = 10_000_000,
  ocrTimeoutMs = 20_000,
} = {}) {
  const bytes = Buffer.from(input.bytes ?? "");
  if (bytes.length > maxBytes) {
    return createDocumentResult({
      ...input,
      bytes,
      byte_size: bytes.length,
      byte_sha256: sha256Bytes(bytes),
      detected_format: "image",
      extraction_status: "bounded_limit_exceeded",
      parser_name: IMAGE_OCR_PARSER_NAME,
      parser_version: IMAGE_OCR_PARSER_VERSION,
      quality_status: "bounded_limit_exceeded",
      quality_reasons: ["max_image_bytes_exceeded"],
      manual_review_reasons: ["max_image_bytes_exceeded"],
    });
  }
  if (!ocrAdapter.available) {
    return createDocumentResult({
      ...input,
      bytes,
      byte_size: bytes.length,
      byte_sha256: sha256Bytes(bytes),
      detected_format: "image",
      detected_mime_type: input.detected_mime_type ?? "image/unknown",
      extraction_status: "tool_unavailable",
      extraction_method: "ocr",
      parser_name: IMAGE_OCR_PARSER_NAME,
      parser_version: IMAGE_OCR_PARSER_VERSION,
      ocr_engine: ocrAdapter.engineName,
      ocr_engine_version: ocrAdapter.engineVersion,
      quality_status: "tool_unavailable",
      quality_reasons: ["ocr_tool_unavailable"],
      manual_review_reasons: ["ocr_tool_unavailable"],
    });
  }
  try {
    const recognized = await recognizeImageWithTimeout(ocrAdapter, bytes, input.ocr_options ?? {}, ocrTimeoutMs);
    const text = recognized.text ?? "";
    const quality = evaluateDocumentQuality({
      text,
      contentBlocks: text ? [{ type: "ocr_text", text, source_order: 0 }] : [],
      imageCount: 1,
      ocrUsed: true,
      ocrConfidence: recognized.confidence,
    });
    return createDocumentResult({
      ...input,
      bytes,
      byte_size: bytes.length,
      byte_sha256: sha256Bytes(bytes),
      detected_format: "image",
      detected_mime_type: input.detected_mime_type ?? "image/unknown",
      extraction_status: quality.quality_status,
      extraction_method: "ocr",
      parser_name: IMAGE_OCR_PARSER_NAME,
      parser_version: IMAGE_OCR_PARSER_VERSION,
      ocr_used: true,
      ocr_engine: ocrAdapter.engineName,
      ocr_engine_version: ocrAdapter.engineVersion,
      ocr_invocation_count: 1,
      extracted_text: text,
      content_blocks: text ? [{ type: "ocr_text", text, source_order: 0, confidence: recognized.confidence ?? null }] : [],
      ...quality,
      provenance: { ...(input.provenance ?? {}), ocr_confidence: recognized.confidence ?? null },
    });
  } catch (error) {
    const timedOut = error?.code === "ocr_timeout" || error?.name === "AbortError";
    return createDocumentResult({
      ...input,
      bytes,
      byte_size: bytes.length,
      byte_sha256: sha256Bytes(bytes),
      detected_format: "image",
      extraction_status: "parser_failed",
      extraction_method: "ocr",
      parser_name: IMAGE_OCR_PARSER_NAME,
      parser_version: IMAGE_OCR_PARSER_VERSION,
      ocr_engine: ocrAdapter.engineName,
      ocr_engine_version: ocrAdapter.engineVersion,
      quality_status: "manual_review_required",
      quality_reasons: [timedOut ? "ocr_timeout" : "ocr_failed"],
      manual_review_reasons: [timedOut ? "ocr_timeout" : "ocr_failed"],
      error_summary: error,
    });
  }
}
