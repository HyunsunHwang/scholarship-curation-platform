import crypto from "node:crypto";

export const ATTACHMENT_SECURITY_LIMITS = Object.freeze({
  redirect_limit: 3,
  timeout_ms: 15_000,
  max_byte_size: 15 * 1024 * 1024,
});

const MIME_BY_KIND = {
  PDF: new Set(["application/pdf"]),
  HWP: new Set([
    "application/x-hwp",
    "application/haansofthwp",
    "application/vnd.hancom.hwp",
  ]),
  HWPX: new Set([
    "application/hwp+zip",
    "application/vnd.hancom.hwpx",
    "application/zip",
  ]),
  IMAGE: new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]),
};

function startsWith(buffer, signature) {
  return signature.every((value, index) => buffer[index] === value);
}

export function validateAttachmentUrl(rawUrl, allowedHosts) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:") {
    return { allowed: false, reason: "https_required" };
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = allowedHosts.some((allowedHost) => {
    const normalized = allowedHost.toLowerCase();
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
  return {
    allowed,
    reason: allowed ? null : "domain_not_allowlisted",
    hostname,
  };
}

export function detectAttachmentKind(buffer, filename = "") {
  const lower = filename.toLowerCase();
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return "PDF";
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0])) {
    return lower.endsWith(".hwp") ? "HWP" : "UNKNOWN_BINARY";
  }
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return lower.endsWith(".hwpx") ? "HWPX" : "UNKNOWN_BINARY";
  }
  if (
    startsWith(buffer, [0x89, 0x50, 0x4e, 0x47]) ||
    startsWith(buffer, [0xff, 0xd8, 0xff]) ||
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) ||
    startsWith(buffer, [0x47, 0x49, 0x46, 0x38])
  ) {
    return "IMAGE";
  }
  return "UNKNOWN_BINARY";
}

export function inspectDownloadedAttachment({
  filename,
  url,
  contentType,
  bytes,
  allowedHosts,
  redirectCount = 0,
  parserAttempted = false,
  extractedText = "",
}) {
  const urlCheck = validateAttachmentUrl(url, allowedHosts);
  if (!urlCheck.allowed) {
    return {
      status: "DOWNLOAD_BLOCKED",
      stages: {
        metadata_discovered: true,
        url_resolved: false,
        download_attempted: false,
        bytes_received: false,
        mime_checked: false,
        signature_checked: false,
        hash_calculated: false,
        parser_selected: false,
        extraction_attempted: false,
        useful_text_extracted: false,
      },
      reason: urlCheck.reason,
    };
  }
  if (redirectCount > ATTACHMENT_SECURITY_LIMITS.redirect_limit) {
    return {
      status: "DOWNLOAD_BLOCKED",
      stages: {
        metadata_discovered: true,
        url_resolved: true,
        download_attempted: true,
        bytes_received: false,
        mime_checked: false,
        signature_checked: false,
        hash_calculated: false,
        parser_selected: false,
        extraction_attempted: false,
        useful_text_extracted: false,
      },
      reason: "redirect_limit_exceeded",
    };
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return {
      status: "DOWNLOAD_BLOCKED",
      stages: {
        metadata_discovered: true,
        url_resolved: true,
        download_attempted: true,
        bytes_received: false,
        mime_checked: false,
        signature_checked: false,
        hash_calculated: false,
        parser_selected: false,
        extraction_attempted: false,
        useful_text_extracted: false,
      },
      reason: "no_bytes_received",
    };
  }
  if (bytes.length > ATTACHMENT_SECURITY_LIMITS.max_byte_size) {
    return {
      status: "DOWNLOAD_BLOCKED",
      stages: {
        metadata_discovered: true,
        url_resolved: true,
        download_attempted: true,
        bytes_received: true,
        mime_checked: false,
        signature_checked: false,
        hash_calculated: false,
        parser_selected: false,
        extraction_attempted: false,
        useful_text_extracted: false,
      },
      reason: "max_byte_size_exceeded",
      byte_count: bytes.length,
    };
  }

  const kind = detectAttachmentKind(bytes, filename);
  const normalizedContentType = String(contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const expectedMimes = MIME_BY_KIND[kind];
  const mimeMatches = expectedMimes?.has(normalizedContentType) ?? false;
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const urlHash = crypto.createHash("sha256").update(url).digest("hex");
  const usefulText = extractedText.replace(/\s+/g, " ").trim();

  if (kind !== "UNKNOWN_BINARY" && !mimeMatches) {
    return {
      status: "CONTENT_TYPE_MISMATCH",
      detected_kind: kind,
      mime: normalizedContentType,
      byte_count: bytes.length,
      content_hash: contentHash,
      url_hash: urlHash,
      stages: {
        metadata_discovered: true,
        url_resolved: true,
        download_attempted: true,
        bytes_received: true,
        mime_checked: true,
        signature_checked: true,
        hash_calculated: true,
        parser_selected: false,
        extraction_attempted: false,
        useful_text_extracted: false,
      },
    };
  }

  let status = "MANUAL_REVIEW_REQUIRED";
  if (kind === "PDF" && parserAttempted && usefulText.length >= 30) status = "PDF_TEXT";
  else if (kind === "PDF" && parserAttempted) status = "PDF_IMAGE_ONLY";
  else if (kind === "PDF") status = "PARSER_UNAVAILABLE";
  else if (kind === "HWP") status = "HWP";
  else if (kind === "HWPX") status = "HWPX";
  else if (kind === "IMAGE") status = "OCR_REQUIRED";
  else if (kind === "UNKNOWN_BINARY") status = "UNKNOWN_BINARY";

  return {
    status,
    detected_kind: kind,
    filename,
    mime: normalizedContentType,
    byte_count: bytes.length,
    content_hash: contentHash,
    url_hash: urlHash,
    sanitized_text_sample:
      status === "PDF_TEXT" ? usefulText.slice(0, 160) : null,
    external_llm_upload_performed: false,
    arbitrary_execution_performed: false,
    document_network_access_enabled: false,
    stages: {
      metadata_discovered: true,
      url_resolved: true,
      download_attempted: true,
      bytes_received: true,
      mime_checked: true,
      signature_checked: true,
      hash_calculated: true,
      parser_selected: parserAttempted || kind !== "UNKNOWN_BINARY",
      extraction_attempted: parserAttempted,
      useful_text_extracted: status === "PDF_TEXT",
    },
  };
}
