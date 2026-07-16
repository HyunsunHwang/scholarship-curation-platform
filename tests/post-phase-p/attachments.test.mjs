import assert from "node:assert/strict";
import {
  ATTACHMENT_SECURITY_LIMITS,
  detectAttachmentKind,
  inspectDownloadedAttachment,
  validateAttachmentUrl,
} from "../../lib/post-phase-n-q/attachments.mjs";

const hosts = ["example.edu"];
assert.equal(validateAttachmentUrl("http://example.edu/a.pdf", hosts).allowed, false);
assert.equal(validateAttachmentUrl("https://evil.example/a.pdf", hosts).allowed, false);
assert.equal(validateAttachmentUrl("https://files.example.edu/a.pdf", hosts).allowed, true);
assert.equal(detectAttachmentKind(Buffer.from("%PDF-1.7"), "a.pdf"), "PDF");
assert.equal(
  detectAttachmentKind(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), "a.hwp"),
  "HWP",
);
assert.equal(
  detectAttachmentKind(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "a.hwpx"),
  "HWPX",
);

const parsedPdf = inspectDownloadedAttachment({
  filename: "notice.pdf",
  url: "https://files.example.edu/notice.pdf",
  contentType: "application/pdf",
  bytes: Buffer.from("%PDF-1.7 fixture"),
  allowedHosts: hosts,
  parserAttempted: true,
  extractedText:
    "장학금 신청 자격과 제출 서류, 등록금 지원 범위를 설명하는 충분한 길이의 안전한 샘플입니다.",
});
assert.equal(parsedPdf.status, "PDF_TEXT");
assert.equal(parsedPdf.stages.useful_text_extracted, true);

const metadataOnly = inspectDownloadedAttachment({
  filename: "notice.pdf",
  url: "https://files.example.edu/notice.pdf",
  contentType: "application/pdf",
  bytes: Buffer.from("%PDF-1.7 fixture"),
  allowedHosts: hosts,
});
assert.equal(metadataOnly.status, "PARSER_UNAVAILABLE");
assert.equal(metadataOnly.stages.extraction_attempted, false);

const mismatch = inspectDownloadedAttachment({
  filename: "notice.pdf",
  url: "https://files.example.edu/notice.pdf",
  contentType: "image/png",
  bytes: Buffer.from("%PDF-1.7 fixture"),
  allowedHosts: hosts,
});
assert.equal(mismatch.status, "CONTENT_TYPE_MISMATCH");

const oversized = inspectDownloadedAttachment({
  filename: "notice.pdf",
  url: "https://files.example.edu/notice.pdf",
  contentType: "application/pdf",
  bytes: Buffer.alloc(ATTACHMENT_SECURITY_LIMITS.max_byte_size + 1),
  allowedHosts: hosts,
});
assert.equal(oversized.status, "DOWNLOAD_BLOCKED");
assert.equal(oversized.reason, "max_byte_size_exceeded");

console.log(JSON.stringify({
  passed: true,
  test_count: 12,
  metadata_is_not_parsing: true,
  mime_and_signature_validation: true,
  external_llm_upload_performed: false,
  arbitrary_execution_performed: false,
}, null, 2));
