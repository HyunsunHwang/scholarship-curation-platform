import { createDocumentResult, sha256Bytes } from "./contract.mjs";
import { buildDocumentCacheKey, shouldCacheDocumentResult } from "./cache.mjs";
import { HTML_PARSER_NAME, HTML_PARSER_VERSION, parseHtmlDocument } from "./html-parser.mjs";
import { IMAGE_OCR_PARSER_NAME, IMAGE_OCR_PARSER_VERSION, createUnavailableImageOcrAdapter, parseImageDocument } from "./image-ocr.mjs";
import { PDF_PARSER_NAME, PDF_PARSER_VERSION, parsePdfDocument } from "./pdf-parser.mjs";
import { HWP_PARSER_NAME, HWP_PARSER_VERSION, detectHwpFormat, parseHwpDocument } from "./hwp-parser.mjs";

const FORMAT_MIME = {
  html: "text/html",
  pdf: "application/pdf",
  image: "image/unknown",
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
};

function extension(filename = "") {
  return String(filename).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function detectDocumentFormat({ bytes = Buffer.alloc(0), filename = "", mimeType = "", html = null } = {}) {
  const buffer = Buffer.from(bytes ?? "");
  const mime = String(mimeType).toLowerCase();
  const ext = extension(filename);
  if (html !== null || mime.includes("html") || ["html", "htm"].includes(ext)) return "html";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-" || mime.includes("pdf") || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"].includes(ext)) return "image";
  const hwp = detectHwpFormat(buffer, filename);
  if (hwp !== "unknown" || mime.includes("hwp")) return hwp === "unknown" ? (ext === "hwpx" ? "hwpx" : "hwp") : hwp;
  return "unknown";
}

function parserIdentity(format) {
  if (format === "html") return [HTML_PARSER_NAME, HTML_PARSER_VERSION];
  if (format === "pdf") return [PDF_PARSER_NAME, PDF_PARSER_VERSION];
  if (format === "image") return [IMAGE_OCR_PARSER_NAME, IMAGE_OCR_PARSER_VERSION];
  if (format === "hwp" || format === "hwpx") return [HWP_PARSER_NAME, HWP_PARSER_VERSION];
  return ["unsupported", "1.0.0"];
}

function cacheOptions(options) {
  return {
    maxBytes: options.maxBytes ?? null,
    maxPages: options.maxPages ?? null,
    maxOcrPages: options.maxOcrPages ?? null,
    ocrTimeoutMs: options.ocrTimeoutMs ?? null,
    minTextPerPage: options.minTextPerPage ?? null,
    contentSelector: options.contentSelector ?? null,
  };
}

export function createDocumentParserRegistry({
  cache = null,
  ocrAdapter = createUnavailableImageOcrAdapter(),
  hwpBinaryAdapter = null,
  parserOverrides = {},
} = {}) {
  let parserInvocationCount = 0;
  return {
    get parserInvocationCount() { return parserInvocationCount; },
    capabilities() {
      return {
        formats: ["html", "pdf", "image", "hwp", "hwpx"],
        ocr: { available: ocrAdapter.available, engine: ocrAdapter.engineName, version: ocrAdapter.engineVersion },
        hwp_binary: { available: hwpBinaryAdapter?.available === true },
        hwpx_xml: { available: true },
      };
    },
    async parse(input = {}, options = {}) {
      const bytes = input.html !== undefined ? Buffer.from(String(input.html)) : Buffer.from(input.bytes ?? "");
      const format = detectDocumentFormat({ bytes, filename: input.filename, mimeType: input.mime_type ?? input.detected_mime_type, html: input.html ?? null });
      const [parserName, parserVersion] = parserIdentity(format);
      const byteSha256 = sha256Bytes(bytes);
      const cacheKey = buildDocumentCacheKey({
        byteSha256,
        parserName,
        parserVersion,
        ocrEngine: ocrAdapter.engineName,
        ocrEngineVersion: ocrAdapter.engineVersion,
        options: cacheOptions(options),
      });
      const cached = cache?.get(cacheKey) ?? { status: "miss", value: null };
      if (cached.status === "hit") {
        const failed = ["tool_unavailable", "unsupported_format", "encrypted_or_protected"].includes(cached.value.extraction_status);
        return createDocumentResult({
          ...cached.value,
          cache_status: failed ? "hit_failure" : "hit_success",
          cache_key: cacheKey,
          cache_hit: true,
          reparsed: false,
        });
      }
      parserInvocationCount += 1;
      const common = {
        ...input,
        bytes,
        byte_sha256: byteSha256,
        detected_format: format,
        detected_mime_type: input.mime_type ?? FORMAT_MIME[format] ?? "application/octet-stream",
        document_id: input.document_id ?? sha256Bytes(`${input.source_id ?? input.source_key ?? "unknown"}|${input.notice_identity_reference ?? input.canonical_url ?? input.original_url ?? "unknown"}|${byteSha256}`),
      };
      let result;
      const override = parserOverrides[format];
      if (override) result = await override(common, options);
      else if (format === "html") result = await parseHtmlDocument({ ...common, html: input.html ?? bytes.toString("utf8"), contentSelector: options.contentSelector });
      else if (format === "pdf") result = await parsePdfDocument(common, { ...options, ocrAdapter });
      else if (format === "image") result = await parseImageDocument(common, { ...options, ocrAdapter });
      else if (format === "hwp" || format === "hwpx") result = await parseHwpDocument(common, { ...options, hwpBinaryAdapter });
      else result = createDocumentResult({
        ...common,
        extraction_status: "unsupported_format",
        extraction_method: "none",
        parser_name: parserName,
        parser_version: parserVersion,
        quality_status: "manual_review_required",
        quality_reasons: ["unsupported_format"],
        manual_review_reasons: ["unsupported_format"],
      });
      result = createDocumentResult({
        ...result,
        cache_status: cached.status === "corrupt" ? "corrupt_cache_entry" : "miss",
        cache_key: cacheKey,
        cache_hit: false,
        reparsed: cached.status === "corrupt",
        reparse_reason: cached.status === "corrupt" ? "corrupt_cache_entry" : null,
      });
      if (cache && shouldCacheDocumentResult(result)) cache.set(cacheKey, result);
      return result;
    },
  };
}
