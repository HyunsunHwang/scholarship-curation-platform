import crypto from "node:crypto";
import { TextDecoder } from "node:util";
import { extractFromList } from "../crawler-list-parser.mjs";
import { applyListParserProfile } from "../list-parser-profiles.mjs";
import { buildPhase2CandidateComparison } from "./phase2-candidate-comparison.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function requiredText(value, label) {
  const text = clean(value);
  if (!text) throw new Error(`Same-capture comparison requires ${label}.`);
  return text;
}

function captureBytes(capture = {}) {
  const base64 = clean(capture.html_base64 ?? capture.htmlBase64);
  const html = capture.html;
  if (base64 && html !== undefined) throw new Error("Capture must provide exactly one lossless HTML encoding.");
  if (base64) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
      throw new Error("Capture html_base64 is invalid.");
    }
    return Buffer.from(base64, "base64");
  }
  if (typeof html === "string") return Buffer.from(html, "utf8");
  throw new Error("Capture requires html_base64 or UTF-8 html.");
}

function readCapture(capture = {}) {
  const bytes = captureBytes(capture);
  const sourceId = requiredText(capture.source_id ?? capture.sourceId, "capture source_id");
  const captureId = requiredText(capture.capture_id ?? capture.captureId, "capture capture_id");
  const requestedUrl = requiredText(capture.requested_url ?? capture.requestedUrl, "capture requested_url");
  const finalUrl = requiredText(capture.final_url ?? capture.finalUrl, "capture final_url");
  const calculatedHash = sha256(bytes);
  const declaredHash = clean(capture.html_sha256 ?? capture.htmlSha256);
  if (declaredHash && declaredHash.toLowerCase() !== calculatedHash) {
    throw new Error("Capture declared html_sha256 does not match calculated bytes.");
  }
  const responseByteCount = capture.response_byte_count ?? capture.responseByteCount;
  if (!Number.isSafeInteger(responseByteCount) || responseByteCount < 0 || responseByteCount !== bytes.length) {
    throw new Error("Capture response_byte_count must equal the captured byte length.");
  }
  if (!Array.isArray(capture.redirect_chain ?? capture.redirectChain)) {
    throw new Error("Capture redirect_chain must be an array.");
  }
  const charset = clean(capture.charset) || "utf-8";
  let html;
  try { html = new TextDecoder(charset, { fatal: true }).decode(bytes); } catch {
    throw new Error(`Capture charset ${charset} cannot decode captured HTML bytes losslessly enough for parser execution.`);
  }
  return Object.freeze({
    source_id: sourceId,
    capture_id: captureId,
    requested_url: requestedUrl,
    final_url: finalUrl,
    captured_at: requiredText(capture.captured_at ?? capture.capturedAt, "capture captured_at"),
    content_type: requiredText(capture.content_type ?? capture.contentType, "capture content_type"),
    charset,
    response_byte_count: bytes.length,
    redirect_chain: capture.redirect_chain ?? capture.redirectChain,
    html_sha256: calculatedHash,
    html_bytes: bytes,
    html,
  });
}

function sourceFromConfig(config, label, capture) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error(`${label} parser config must be an object.`);
  if (Object.hasOwn(config, "html") || Object.hasOwn(config, "html_base64") || Object.hasOwn(config, "htmlBase64")) {
    throw new Error(`${label} parser config cannot supply separate HTML.`);
  }
  const source = config.source ?? config;
  if (clean(source.sourceId ?? source.source_id) !== capture.source_id) {
    throw new Error(`${label} parser config source ID must match the capture source ID.`);
  }
  return applyListParserProfile({ ...source, sourceId: capture.source_id, listUrl: source.listUrl ?? capture.final_url });
}

function normalizeCandidates(items, capture, parserEvidence) {
  return items.map((item) => ({
    ...item,
    provenance: item?.__crawlerCandidateProvenance ?? item?.provenance ?? null,
    parser_strategy: parserEvidence?.parser_strategy ?? null,
    matched_selector: item?.__crawlerCandidateProvenance?.matched_list_selector
      ?? parserEvidence?.matched_list_selector ?? null,
    source_capture_hash: capture.html_sha256,
  }));
}

function parserResult({ parser, source, capture, label }) {
  const items = parser({ source, html: capture.html, htmlBytes: capture.html_bytes, label });
  if (!Array.isArray(items)) throw new Error(`${label} parser must return a candidate array.`);
  const parserEvidence = items.operational_parser_evidence ?? null;
  return {
    source_id: capture.source_id,
    capture_id: capture.capture_id,
    requested_url: capture.requested_url,
    final_url: capture.final_url,
    html_sha256: capture.html_sha256,
    parser_config: {
      list_item_selector: clean(source.listItemSelector) || null,
      link_selector: clean(source.linkSelector) || null,
      title_selector: clean(source.titleSelector) || null,
      date_selector: clean(source.dateSelector) || null,
      notice_url_pattern: clean(source.noticeUrlPattern) || null,
      list_parser_profile: clean(source.listParserProfile) || null,
    },
    parser_evidence: parserEvidence,
    candidates: normalizeCandidates(items, capture, parserEvidence),
  };
}

/** Runs both configurations against a single in-memory capture. No fetch is performed. */
export function buildPhase2SameHtmlComparison({ capture, controlConfig, treatmentConfig, parser } = {}) {
  const normalizedCapture = readCapture(capture);
  const controlSource = sourceFromConfig(controlConfig, "control", normalizedCapture);
  const treatmentSource = sourceFromConfig(treatmentConfig, "treatment", normalizedCapture);
  const execute = parser ?? (({ source, html }) => extractFromList(source, html));
  const control = parserResult({ parser: execute, source: controlSource, capture: normalizedCapture, label: "control" });
  const treatment = parserResult({ parser: execute, source: treatmentSource, capture: normalizedCapture, label: "treatment" });
  for (const result of [control, treatment]) {
    if (result.source_id !== normalizedCapture.source_id || result.capture_id !== normalizedCapture.capture_id
      || result.html_sha256 !== normalizedCapture.html_sha256 || result.requested_url !== normalizedCapture.requested_url
      || result.final_url !== normalizedCapture.final_url) {
      throw new Error("Control and treatment results must retain identical capture provenance.");
    }
  }
  const comparison = buildPhase2CandidateComparison({ sourceId: normalizedCapture.source_id, control, treatment });
  return {
    schema_version: "phase2-same-html-comparison-v1",
    source_id: normalizedCapture.source_id,
    capture_id: normalizedCapture.capture_id,
    capture: {
      source_id: normalizedCapture.source_id,
      capture_id: normalizedCapture.capture_id,
      requested_url: normalizedCapture.requested_url,
      final_url: normalizedCapture.final_url,
      captured_at: normalizedCapture.captured_at,
      content_type: normalizedCapture.content_type,
      charset: normalizedCapture.charset,
      response_byte_count: normalizedCapture.response_byte_count,
      redirect_chain: normalizedCapture.redirect_chain,
      html_sha256: normalizedCapture.html_sha256,
    },
    control,
    treatment,
    candidate_comparison: comparison,
  };
}
