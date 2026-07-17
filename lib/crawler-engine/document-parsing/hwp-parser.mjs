import AdmZip from "adm-zip";
import { createDocumentResult, sha256Bytes } from "./contract.mjs";
import { evaluateDocumentQuality } from "./quality.mjs";

export const HWP_PARSER_NAME = "hwp-capability-adapter";
export const HWP_PARSER_VERSION = "1.0.0";

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function xmlText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectHwpFormat(bytes, filename = "") {
  const buffer = Buffer.from(bytes ?? "");
  if (buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE)) return "hwp";
  if (/\.hwpx$/i.test(filename)) return "hwpx";
  if (buffer.subarray(0, 2).toString("binary") === "PK") {
    try {
      const names = new AdmZip(buffer).getEntries().map((entry) => entry.entryName.toLowerCase());
      if (names.includes("mimetype") && names.some((name) => /^contents\/section\d+\.xml$/.test(name))) return "hwpx";
    } catch {
      return "unknown";
    }
  }
  return /\.hwp$/i.test(filename) ? "hwp" : "unknown";
}

export function classifyHwpRole({ filename = "", bodyText = "", hasAlternativeReadableDocument = false } = {}) {
  const evidence = `${filename} ${bodyText}`;
  if (/신청서|신청양식|지원서|양식|application|form/i.test(evidence)) return "application_form";
  if (/증빙|첨부|서약서|동의서|support/i.test(evidence)) return "supporting_form";
  if (!hasAlternativeReadableDocument && String(bodyText).trim().length < 80) return "primary_notice_document";
  return "unknown";
}

async function parseHwpx(bytes, maxUncompressedBytes) {
  const zip = new AdmZip(Buffer.from(bytes));
  const entries = zip.getEntries()
    .filter((entry) => /^Contents\/section\d+\.xml$/i.test(entry.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  const total = entries.reduce((sum, entry) => sum + Number(entry.header?.size ?? 0), 0);
  if (total > maxUncompressedBytes) {
    throw Object.assign(new Error("HWPX uncompressed bound exceeded."), { code: "bounded_limit_exceeded" });
  }
  const blocks = entries.map((entry, index) => ({
    type: "hwpx_section",
    section: entry.entryName,
    text: xmlText(entry.getData().toString("utf8")),
    source_order: index,
  }));
  return { text: blocks.map((block) => block.text).filter(Boolean).join("\n\n"), blocks };
}

export async function parseHwpDocument(input = {}, {
  hwpBinaryAdapter = null,
  maxBytes = 20_000_000,
  maxUncompressedBytes = 30_000_000,
} = {}) {
  const bytes = Buffer.from(input.bytes ?? "");
  const format = detectHwpFormat(bytes, input.filename);
  const role = classifyHwpRole(input.notice_context ?? { filename: input.filename });
  const base = {
    ...input,
    bytes,
    byte_size: bytes.length,
    byte_sha256: sha256Bytes(bytes),
    detected_format: format,
    detected_mime_type: format === "hwpx" ? "application/hwp+zip" : "application/x-hwp",
    parser_name: HWP_PARSER_NAME,
    parser_version: HWP_PARSER_VERSION,
  };
  if (bytes.length > maxBytes) return createDocumentResult({
    ...base,
    extraction_status: "bounded_limit_exceeded",
    quality_status: "bounded_limit_exceeded",
    quality_reasons: ["max_hwp_bytes_exceeded"],
    manual_review_reasons: ["max_hwp_bytes_exceeded"],
  });
  if (format === "unknown") return createDocumentResult({
    ...base,
    extraction_status: "unsupported_format",
    quality_status: "manual_review_required",
    quality_reasons: ["unsupported_hwp_signature"],
    manual_review_reasons: ["unsupported_hwp_signature"],
  });
  try {
    let parsed;
    if (format === "hwpx") parsed = await parseHwpx(bytes, maxUncompressedBytes);
    else if (hwpBinaryAdapter?.available) parsed = await hwpBinaryAdapter.extract(bytes, input);
    else {
      const hwpOnly = role === "primary_notice_document";
      return createDocumentResult({
        ...base,
        extraction_status: hwpOnly ? "hwp_only_primary_document" : "tool_unavailable",
        extraction_method: "capability_detection",
        quality_status: "manual_review_required",
        quality_reasons: ["hwp_binary_parser_tool_unavailable", `hwp_role:${role}`],
        manual_review_reasons: [hwpOnly ? "hwp_only_primary_document" : "hwp_binary_parser_tool_unavailable"],
        provenance: { ...(input.provenance ?? {}), hwp_role: role, parser_tool_available: false },
      });
    }
    const quality = evaluateDocumentQuality({ text: parsed.text, contentBlocks: parsed.blocks ?? [], parserAvailable: true });
    return createDocumentResult({
      ...base,
      extraction_status: quality.quality_status,
      extraction_method: format === "hwpx" ? "hwpx_xml" : "hwp_binary_adapter",
      extracted_text: parsed.text,
      content_blocks: parsed.blocks ?? [],
      ...quality,
      provenance: { ...(input.provenance ?? {}), hwp_role: role, parser_tool_available: true },
    });
  } catch (error) {
    const bounded = error?.code === "bounded_limit_exceeded";
    return createDocumentResult({
      ...base,
      extraction_status: bounded ? "bounded_limit_exceeded" : "parser_failed",
      extraction_method: format === "hwpx" ? "hwpx_xml" : "hwp_binary_adapter",
      quality_status: bounded ? "bounded_limit_exceeded" : "manual_review_required",
      quality_reasons: [bounded ? "hwpx_uncompressed_bound_exceeded" : "hwp_parser_failed"],
      manual_review_reasons: [bounded ? "hwpx_uncompressed_bound_exceeded" : "hwp_parser_failed"],
      error_summary: error,
      provenance: { ...(input.provenance ?? {}), hwp_role: role },
    });
  }
}
