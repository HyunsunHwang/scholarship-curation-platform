import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  DOCUMENT_EXTRACTION_STATUSES,
  buildDocumentCacheKey,
  classifyHwpRole,
  createDocumentParseCache,
  createDocumentParserRegistry,
  createImageOcrAdapter,
  createCrawlerDocumentRuntime,
  createNoticeDocumentProcessor,
  detectDocumentFormat,
  detectHwpFormat,
  evaluateDocumentQuality,
  normalizeDocumentText,
  parseHtmlDocument,
  parseHwpDocument,
  parseImageDocument,
  parsePdfDocument,
  isEncryptedPdfError,
  isDocumentParsingEnabled,
  sha256Bytes,
  summarizeNoticeDocumentEvidence,
  shouldCacheDocumentResult,
} from "../lib/crawler-engine/document-parsing/index.mjs";
import { runBoundedCrawlerSource, runCommonCrawlerSource } from "../lib/crawler-engine/common-runner.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import { buildNormalizedGraphPlan } from "../lib/post-phase-l/normalized-graph.mjs";
import { createAuthoritativeDocumentRuntime, fetchUrlWithMetadata } from "./crawl-scholarship-notices.mjs";
import { normalizePilotInput } from "./ingest-post-phase-l.mjs";

const tests = [];
function test(name, operation) { tests.push({ name, operation }); }

async function textPdf(texts) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const text of texts) {
    const page = document.addPage([400, 400]);
    if (text) page.drawText(text, { x: 30, y: 340, size: 11, font, maxWidth: 340 });
  }
  return Buffer.from(await document.save());
}

function hwpxFixture(text = "Synthetic scholarship notice section with eligibility and application deadline.") {
  const zip = new AdmZip();
  zip.addFile("mimetype", Buffer.from("application/hwp+zip"));
  zip.addFile("Contents/section0.xml", Buffer.from(`<hp:p><hp:t>${text}</hp:t></hp:p>`));
  return zip.toBuffer();
}

function successfulOcr(text = "Synthetic OCR scholarship notice with sufficient eligibility and deadline details.", confidence = 92) {
  let count = 0;
  return {
    adapter: createImageOcrAdapter({
      engineName: "fixture-ocr",
      engineVersion: "1",
      async recognize() { count += 1; return { text, confidence }; },
    }),
    get count() { return count; },
  };
}

const longHtml = `<!doctype html><html><body><nav>menu</nav><main>
  <h1>2026 Synthetic Scholarship Notice</h1>
  <p>Eligible students may apply before the published application deadline.</p>
  <ul><li>Submit an application</li><li>Attach supporting evidence</li></ul>
  <table><caption>Schedule</caption><tr><th>Date</th><th>Step</th></tr><tr><td>July 31</td><td>Deadline</td></tr></table>
  <img src="poster.png" alt="Scholarship poster"><footer>privacy</footer>
</main></body></html>`;

test("contract exposes required quality states", () => {
  for (const status of ["text_sufficient", "table_structure_preserved", "ocr_succeeded", "hwp_only_primary_document", "tool_unavailable"]) {
    assert.ok(DOCUMENT_EXTRACTION_STATUSES.includes(status));
  }
});
test("text normalization is deterministic", () => assert.equal(normalizeDocumentText(" A\r\n  B  "), "A\nB"));
test("byte fingerprint is deterministic", () => assert.equal(sha256Bytes("same"), sha256Bytes(Buffer.from("same"))));
test("byte fingerprint changes with bytes", () => assert.notEqual(sha256Bytes("a"), sha256Bytes("b")));
test("cache key is deterministic", () => {
  const input = { byteSha256: sha256Bytes("a"), parserName: "p", parserVersion: "1", options: { maxPages: 2 } };
  assert.equal(buildDocumentCacheKey(input), buildDocumentCacheKey(input));
});
test("cache key changes with parser version", () => {
  const base = { byteSha256: sha256Bytes("a"), parserName: "p", options: {} };
  assert.notEqual(buildDocumentCacheKey({ ...base, parserVersion: "1" }), buildDocumentCacheKey({ ...base, parserVersion: "2" }));
});
test("cache key changes with OCR version", () => {
  const base = { byteSha256: sha256Bytes("a"), parserName: "p", parserVersion: "1", ocrEngine: "x" };
  assert.notEqual(buildDocumentCacheKey({ ...base, ocrEngineVersion: "1" }), buildDocumentCacheKey({ ...base, ocrEngineVersion: "2" }));
});
test("HTML format is detected by content", () => assert.equal(detectDocumentFormat({ html: "<p>x</p>" }), "html"));
test("PDF format is detected by signature", () => assert.equal(detectDocumentFormat({ bytes: Buffer.from("%PDF-1.7") }), "pdf"));
test("image format is detected by MIME", () => assert.equal(detectDocumentFormat({ mimeType: "image/png" }), "image"));
test("unknown ZIP is not HWPX", () => {
  const zip = new AdmZip(); zip.addFile("plain.txt", Buffer.from("x"));
  assert.equal(detectHwpFormat(zip.toBuffer(), "plain.zip"), "unknown");
});
test("HWPX is detected by package structure", () => assert.equal(detectHwpFormat(hwpxFixture(), "notice.bin"), "hwpx"));
test("binary HWP is detected by OLE signature", () => assert.equal(detectHwpFormat(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]), "x"), "hwp"));

test("HTML headings and paragraphs preserve source order", async () => {
  const result = await parseHtmlDocument({ html: longHtml });
  assert.deepEqual(result.content_blocks.slice(0, 2).map((block) => block.type), ["heading", "paragraph"]);
});
test("HTML navigation noise is removed", async () => assert.doesNotMatch((await parseHtmlDocument({ html: longHtml })).normalized_text, /menu|privacy/));
test("HTML lists remain structured", async () => assert.equal((await parseHtmlDocument({ html: longHtml })).content_blocks.find((block) => block.type === "list").items.length, 2));
test("HTML table headers are retained", async () => assert.deepEqual((await parseHtmlDocument({ html: longHtml })).content_blocks.find((block) => block.type === "table").headers, ["Date", "Step"]));
test("HTML table cell coordinates are retained", async () => assert.equal((await parseHtmlDocument({ html: longHtml })).content_blocks.find((block) => block.type === "table").cells[3].column_index, 1));
test("HTML image references are retained", async () => assert.equal((await parseHtmlDocument({ html: longHtml })).content_blocks.find((block) => block.type === "image_reference").src, "poster.png"));
test("HTML line breaks are retained in text projection", async () => assert.equal((await parseHtmlDocument({ html: "<main><p>first<br>second</p></main>" })).normalized_text, "first\nsecond"));
test("HTML nested attachment references are retained", async () => {
  const result = await parseHtmlDocument({ html: "<main><p>Download <a href='form.hwp'>application form</a></p></main>" });
  assert.equal(result.content_blocks.find((block) => block.type === "attachment_reference").href, "form.hwp");
});
test("HTML rowspan and colspan metadata are retained", async () => {
  const result = await parseHtmlDocument({ html: "<main><table><tr><th rowspan='2'>A</th><th colspan='2'>B</th></tr><tr><td>C</td><td>D</td></tr></table></main>" });
  const cells = result.content_blocks[0].cells;
  assert.equal(cells[0].rowspan, 2); assert.equal(cells[1].colspan, 2);
});
test("image-only HTML is explicit", async () => assert.equal((await parseHtmlDocument({ html: "<main><p><img src='poster.png'></p></main>" })).quality_status, "image_only_detected"));
test("HTML table produces preserved quality state", async () => assert.equal((await parseHtmlDocument({ html: longHtml })).quality_status, "table_structure_preserved"));
test("short HTML requires review", async () => assert.equal((await parseHtmlDocument({ html: "<main><p>short</p></main>" })).quality_status, "text_short_needs_review"));

test("image OCR adapter returns extracted text", async () => {
  const fixture = successfulOcr();
  assert.match((await parseImageDocument({ bytes: Buffer.from("image") }, { ocrAdapter: fixture.adapter })).normalized_text, /Synthetic OCR/);
});
test("image OCR invokes shared adapter once", async () => {
  const fixture = successfulOcr();
  const result = await parseImageDocument({ bytes: Buffer.from("image") }, { ocrAdapter: fixture.adapter });
  assert.equal(result.ocr_invocation_count, 1); assert.equal(fixture.count, 1);
});
test("high-confidence image OCR succeeds", async () => assert.equal((await parseImageDocument({ bytes: Buffer.from("image") }, { ocrAdapter: successfulOcr().adapter })).quality_status, "ocr_succeeded"));
test("low-confidence image OCR is flagged", async () => assert.equal((await parseImageDocument({ bytes: Buffer.from("image") }, { ocrAdapter: successfulOcr("readable but uncertain synthetic scholarship document text", 30).adapter })).quality_status, "ocr_low_quality"));
test("unavailable image OCR is explicit", async () => assert.equal((await parseImageDocument({ bytes: Buffer.from("image") })).extraction_status, "tool_unavailable"));
test("image byte limit is enforced", async () => assert.equal((await parseImageDocument({ bytes: Buffer.alloc(5) }, { maxBytes: 4 })).extraction_status, "bounded_limit_exceeded"));
test("OCR failure is sanitized and reviewable", async () => {
  const adapter = createImageOcrAdapter({ async recognize() { throw new Error("token=secret OCR failed"); } });
  const result = await parseImageDocument({ bytes: Buffer.from("image") }, { ocrAdapter: adapter });
  assert.equal(result.extraction_status, "parser_failed"); assert.doesNotMatch(result.error_summary, /secret/);
});
test("OCR timeout is explicit", async () => {
  const adapter = createImageOcrAdapter({ async recognize() { return new Promise(() => {}); } });
  const result = await parseImageDocument({ bytes: Buffer.from("image") }, { ocrAdapter: adapter, ocrTimeoutMs: 5 });
  assert.equal(result.extraction_status, "parser_failed"); assert.deepEqual(result.manual_review_reasons, ["ocr_timeout"]);
});

test("PDF embedded text is extracted", async () => {
  const result = await parsePdfDocument({ bytes: await textPdf(["Synthetic scholarship eligibility application deadline and selection process details."]) });
  assert.match(result.normalized_text, /scholarship eligibility/);
});
test("PDF page count is recorded", async () => assert.equal((await parsePdfDocument({ bytes: await textPdf(["first page with enough synthetic scholarship information for extraction", "second page with more eligibility and deadline information"]) })).page_count, 2));
test("PDF page blocks preserve order", async () => assert.deepEqual((await parsePdfDocument({ bytes: await textPdf(["first sufficient page scholarship notice content", "second sufficient page scholarship notice content"]) })).content_blocks.map((block) => block.page_number), [1, 2]));
test("scanned PDF uses shared OCR fallback", async () => {
  const fixture = successfulOcr();
  const result = await parsePdfDocument({ bytes: await textPdf([""]) }, { ocrAdapter: fixture.adapter });
  assert.equal(result.ocr_invocation_count, 1); assert.equal(result.quality_status, "ocr_succeeded");
});
test("mixed PDF OCRs only insufficient page", async () => {
  const fixture = successfulOcr();
  const result = await parsePdfDocument({ bytes: await textPdf(["Embedded scholarship notice content long enough to avoid OCR fallback entirely.", ""]) }, { ocrAdapter: fixture.adapter });
  assert.equal(result.ocr_invocation_count, 1); assert.deepEqual(result.content_blocks.map((block) => block.extraction_method), ["embedded_text", "shared_image_ocr"]);
});
test("PDF OCR page limit is enforced", async () => {
  const fixture = successfulOcr();
  const result = await parsePdfDocument({ bytes: await textPdf(["", ""]) }, { ocrAdapter: fixture.adapter, maxOcrPages: 1 });
  assert.equal(result.ocr_invocation_count, 1);
  assert.equal(result.ocr_eligible_page_count, 2);
  assert.equal(result.ocr_processed_page_count, 1);
  assert.equal(result.ocr_skipped_page_count, 1);
  assert.equal(result.extraction_status, "bounded_limit_exceeded");
  assert.equal(result.manual_review_required, true);
  assert.notEqual(result.quality_status, "ocr_succeeded");
  assert.match(result.normalized_text, /Synthetic OCR/);
});
test("PDF OCR accounts for every eligible page when all are handled", async () => {
  const result = await parsePdfDocument({ bytes: await textPdf(["", ""]) }, { ocrAdapter: successfulOcr().adapter, maxOcrPages: 2 });
  assert.equal(result.ocr_eligible_page_count, 2);
  assert.equal(result.ocr_processed_page_count, 2);
  assert.equal(result.ocr_skipped_page_count, 0);
  assert.equal(result.ocr_eligible_page_count, result.ocr_processed_page_count + result.ocr_skipped_page_count);
});
test("PDF OCR eligibility excludes sufficient embedded-text pages", async () => {
  const result = await parsePdfDocument({ bytes: await textPdf(["Embedded scholarship notice text sufficiently long to remain readable without OCR fallback.", ""]) }, { ocrAdapter: successfulOcr().adapter, maxOcrPages: 1 });
  assert.equal(result.ocr_eligible_page_count, 1);
  assert.equal(result.ocr_processed_page_count, 1);
  assert.equal(result.ocr_skipped_page_count, 0);
});
test("PDF without OCR accounts for skipped eligible pages", async () => {
  const result = await parsePdfDocument({ bytes: await textPdf(["", ""]) });
  assert.equal(result.ocr_eligible_page_count, 2);
  assert.equal(result.ocr_processed_page_count, 0);
  assert.equal(result.ocr_skipped_page_count, 2);
  assert.equal(result.extraction_status, "tool_unavailable");
  assert.equal(result.manual_review_required, true);
});
test("PDF OCR timeout preserves successful page text without clean success", async () => {
  let callCount = 0;
  const adapter = createImageOcrAdapter({
    engineName: "fixture-sequential-ocr",
    engineVersion: "1",
    async recognize() {
      callCount += 1;
      if (callCount === 1) return { text: "Retained scholarship OCR text from the first successfully processed page.", confidence: 90 };
      return new Promise(() => {});
    },
  });
  const result = await parsePdfDocument({ bytes: await textPdf(["", ""]) }, { ocrAdapter: adapter, maxOcrPages: 2, ocrTimeoutMs: 5 });
  assert.equal(result.ocr_eligible_page_count, 2);
  assert.equal(result.ocr_processed_page_count, 2);
  assert.equal(result.ocr_skipped_page_count, 0);
  assert.equal(result.extraction_status, "parser_failed");
  assert.match(result.normalized_text, /Retained scholarship OCR text/);
});
test("PDF total page limit is enforced", async () => assert.equal((await parsePdfDocument({ bytes: await textPdf(["a", "b"]) }, { maxPages: 1 })).extraction_status, "bounded_limit_exceeded"));
test("PDF byte limit is enforced", async () => assert.equal((await parsePdfDocument({ bytes: await textPdf(["a"]) }, { maxBytes: 5 })).extraction_status, "bounded_limit_exceeded"));
test("corrupt PDF fails closed", async () => assert.equal((await parsePdfDocument({ bytes: Buffer.from("%PDF-corrupt") })).extraction_status, "parser_failed"));
test("encrypted PDF error classification is explicit", () => assert.equal(isEncryptedPdfError({ name: "PasswordException", message: "password required" }), true));
test("scanned PDF without OCR reports unavailable", async () => assert.equal((await parsePdfDocument({ bytes: await textPdf([""]) })).extraction_status, "tool_unavailable"));

test("HWP application form role is classified", () => assert.equal(classifyHwpRole({ filename: "장학금_신청서.hwp" }), "application_form"));
test("HWP supporting form role is classified", () => assert.equal(classifyHwpRole({ filename: "증빙서류.hwp" }), "supporting_form"));
test("HWP-only primary notice requires manual review", async () => {
  const bytes = Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
  assert.equal((await parseHwpDocument({ bytes, filename: "notice.hwp", notice_context: { filename: "notice.hwp", bodyText: "" } })).extraction_status, "hwp_only_primary_document");
});
test("binary HWP tool absence is explicit for forms", async () => {
  const bytes = Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
  assert.equal((await parseHwpDocument({ bytes, filename: "신청서.hwp", notice_context: { filename: "신청서.hwp" } })).extraction_status, "tool_unavailable");
});
test("HWPX XML text is extracted", async () => assert.match((await parseHwpDocument({ bytes: hwpxFixture(), filename: "notice.hwpx" })).normalized_text, /Synthetic scholarship/));
test("HWPX sections remain structured", async () => assert.equal((await parseHwpDocument({ bytes: hwpxFixture(), filename: "notice.hwpx" })).content_blocks[0].type, "hwpx_section"));
test("available binary HWP adapter is used", async () => {
  const bytes = Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
  const hwpBinaryAdapter = { available: true, async extract() { return { text: "Synthetic binary HWP scholarship notice with sufficient readable application details.", blocks: [{ type: "hwp_text", source_order: 0 }] }; } };
  const result = await parseHwpDocument({ bytes, filename: "notice.hwp" }, { hwpBinaryAdapter });
  assert.equal(result.extraction_method, "hwp_binary_adapter"); assert.equal(result.manual_review_required, false);
});
test("malformed HWPX fails closed", async () => assert.equal((await parseHwpDocument({ bytes: Buffer.from("not zip"), filename: "notice.hwpx" })).extraction_status, "parser_failed"));
test("HWP byte limit is enforced", async () => assert.equal((await parseHwpDocument({ bytes: Buffer.alloc(9), filename: "notice.hwp" }, { maxBytes: 8 })).extraction_status, "bounded_limit_exceeded"));

test("registry positive cache avoids reparsing", async () => {
  const registry = createDocumentParserRegistry({ cache: createDocumentParseCache() });
  const input = { html: longHtml, filename: "notice.html" };
  await registry.parse(input); const second = await registry.parse(input);
  assert.equal(second.cache_status, "hit_success"); assert.equal(registry.parserInvocationCount, 1);
});
test("registry deterministic negative cache avoids retry", async () => {
  const registry = createDocumentParserRegistry({ cache: createDocumentParseCache() });
  const input = { bytes: Buffer.from("image"), mime_type: "image/png" };
  await registry.parse(input); const second = await registry.parse(input);
  assert.equal(second.cache_status, "hit_failure"); assert.equal(registry.parserInvocationCount, 1);
});
test("parser failures are not cached", async () => {
  const registry = createDocumentParserRegistry({ cache: createDocumentParseCache(), parserOverrides: { pdf: async (input) => ({ ...input, extraction_status: "parser_failed" }) } });
  const input = { bytes: Buffer.from("%PDF-bad") };
  await registry.parse(input); await registry.parse(input); assert.equal(registry.parserInvocationCount, 2);
});
test("cache option changes force a reparse", async () => {
  const registry = createDocumentParserRegistry({ cache: createDocumentParseCache() });
  await registry.parse({ html: longHtml }, { maxPages: 1 }); await registry.parse({ html: longHtml }, { maxPages: 2 });
  assert.equal(registry.parserInvocationCount, 2);
});
test("corrupt file cache is ignored and replaced", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "engine-phase-3-cache-"));
  try {
    const input = { html: longHtml };
    const firstRegistry = createDocumentParserRegistry({ cache: createDocumentParseCache({ directory }) });
    const first = await firstRegistry.parse(input);
    fs.writeFileSync(path.join(directory, `${first.cache_key}.json`), "{bad", "utf8");
    const nextRegistry = createDocumentParserRegistry({ cache: createDocumentParseCache({ directory }) });
    const next = await nextRegistry.parse(input);
    assert.equal(next.cache_status, "corrupt_cache_entry"); assert.equal(next.reparsed, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("unsupported format is negative-cache eligible", () => assert.equal(shouldCacheDocumentResult({ extraction_status: "unsupported_format" }), true));
test("download failures are not cache eligible", () => assert.equal(shouldCacheDocumentResult({ extraction_status: "download_failed" }), false));
test("source reference contributes to document id", async () => {
  const registry = createDocumentParserRegistry();
  const a = await registry.parse({ html: longHtml, source_key: "a", canonical_url: "https://example.invalid/n" });
  const b = await registry.parse({ html: longHtml, source_key: "b", canonical_url: "https://example.invalid/n" });
  assert.notEqual(a.document_id, b.document_id);
});
test("same bytes produce same evidence fingerprints", async () => {
  const registry = createDocumentParserRegistry();
  const a = await registry.parse({ html: longHtml }); const b = await registry.parse({ html: longHtml });
  assert.equal(a.byte_sha256, b.byte_sha256); assert.equal(a.normalized_text_sha256, b.normalized_text_sha256);
});
test("fixture rerun is structurally deterministic", async () => {
  const registry = createDocumentParserRegistry();
  const input = { html: longHtml, source_key: "fixture", canonical_url: "https://example.invalid/n" };
  assert.deepEqual(await registry.parse(input), await registry.parse(input));
});
test("quality detects replacement characters", () => assert.ok(evaluateDocumentQuality({ text: "broken � text" }).quality_reasons.includes("replacement_characters_present")));

test("notice processor preserves attachment metadata", async () => {
  const processor = createNoticeDocumentProcessor({ registry: createDocumentParserRegistry() });
  const notice = { body: "Synthetic scholarship notice body long enough for successful extraction and evidence.", attachment_metadata: [{ url: "https://example.invalid/a.pdf" }] };
  const result = await processor({ source: { sourceKey: "fixture" }, notice });
  assert.equal(result.attachment_metadata.length, 1); assert.equal(result.document_extraction_results.length, 1);
});
test("notice processor parses fetched attachment", async () => {
  const bytes = await textPdf(["Synthetic fetched PDF scholarship document with enough content for extraction."]);
  const processor = createNoticeDocumentProcessor({ registry: createDocumentParserRegistry(), fetchAsset: async () => ({ bytes, mimeType: "application/pdf" }) });
  const result = await processor({ source: { sourceKey: "fixture" }, notice: { body: "Body content with enough text to remain readable alongside the PDF attachment.", attachment_metadata: [{ url: "https://example.invalid/a.pdf", filename: "a.pdf" }] } });
  assert.equal(result.document_extraction_results.length, 2);
});
test("notice processor makes download failure reviewable", async () => {
  const processor = createNoticeDocumentProcessor({ registry: createDocumentParserRegistry(), fetchAsset: async () => { throw new Error("network failed"); } });
  const result = await processor({ source: { sourceKey: "fixture" }, notice: { body: "Readable body with enough synthetic scholarship information for extraction.", attachment_metadata: [{ url: "https://example.invalid/a.pdf" }] } });
  assert.equal(result.document_extraction_results[1].extraction_status, "download_failed");
});
test("readable attachment becomes primary content when body is short", async () => {
  const processor = createNoticeDocumentProcessor({
    registry: createDocumentParserRegistry(),
    fetchAsset: async () => ({ bytes: Buffer.from(longHtml), mimeType: "text/html" }),
  });
  const result = await processor({ source: { sourceKey: "fixture" }, notice: { body: "short", attachment_metadata: [{ url: "https://example.invalid/a.html", filename: "a.html" }] } });
  assert.equal(result.document_extraction_results[1].extraction_status, "attachment_primary_content");
});
test("stable asset validators avoid repeated download", async () => {
  let fetchCount = 0;
  const processor = createNoticeDocumentProcessor({
    registry: createDocumentParserRegistry({ cache: createDocumentParseCache() }),
    inspectAsset: async () => ({ etag: "fixture-v1", contentLength: 120, mimeType: "text/html" }),
    fetchAsset: async () => { fetchCount += 1; return { bytes: Buffer.from(longHtml), etag: "fixture-v1", contentLength: 120, mimeType: "text/html" }; },
  });
  const request = { source: { sourceKey: "fixture" }, notice: { body: "Readable synthetic notice body with sufficient details for extraction.", attachment_metadata: [{ url: "https://example.invalid/a.html", filename: "a.html" }] } };
  await processor(request); const second = await processor(request);
  assert.equal(fetchCount, 1); assert.equal(second.document_extraction_results[1].provenance.asset_preflight_cache_hit, true);
});
test("changed asset validator forces a new download", async () => {
  let version = 0; let fetchCount = 0;
  const processor = createNoticeDocumentProcessor({
    registry: createDocumentParserRegistry({ cache: createDocumentParseCache() }),
    inspectAsset: async () => ({ etag: `fixture-v${version += 1}`, mimeType: "text/html" }),
    fetchAsset: async (_asset, { inspected }) => { fetchCount += 1; return { bytes: Buffer.from(`${longHtml}<!--${inspected.etag}-->`), ...inspected }; },
  });
  const request = { source: { sourceKey: "fixture" }, notice: { body: "Readable synthetic notice body with sufficient details for extraction.", attachment_metadata: [{ url: "https://example.invalid/a.html", filename: "a.html" }] } };
  await processor(request); await processor(request); assert.equal(fetchCount, 2);
});
test("asset without validators is downloaded before byte-cache reuse", async () => {
  let fetchCount = 0;
  const processor = createNoticeDocumentProcessor({
    registry: createDocumentParserRegistry({ cache: createDocumentParseCache() }),
    inspectAsset: async () => ({}),
    fetchAsset: async () => { fetchCount += 1; return { bytes: Buffer.from(longHtml), mimeType: "text/html" }; },
  });
  const request = { source: { sourceKey: "fixture" }, notice: { body: "Readable synthetic notice body with sufficient details for extraction.", attachment_metadata: [{ url: "https://example.invalid/a.html", filename: "a.html" }] } };
  await processor(request); const second = await processor(request);
  assert.equal(fetchCount, 2); assert.equal(second.document_extraction_results[1].cache_status, "hit_success");
});
test("common runner invokes optional document hook", async () => {
  const strategy = {
    name: "fixture",
    parseList: () => [{ title: "Notice", noticeUrl: "https://example.invalid/n" }],
    normalizeNotice: ({ item, sourceId }) => ({ ...item, source_id: sourceId, body: "Readable fixture body" }),
  };
  const result = await runCommonCrawlerSource({
    source: { sourceId: "fixture", sourceName: "Fixture", listUrl: "https://example.invalid/list" },
    inventoryRows: [{ source_id: "fixture" }], strategy, fetchHtml: async () => "fixture", fetchDetails: false,
    processNoticeDocuments: async ({ notice }) => ({ ...notice, document_extraction_results: ["called"] }),
  });
  assert.deepEqual(result.notices[0].document_extraction_results, ["called"]);
});
test("common runner remains unchanged without document hook", async () => {
  const strategy = { name: "fixture", parseList: () => [{ noticeUrl: "https://example.invalid/n" }], normalizeNotice: ({ item }) => ({ ...item, marker: "legacy" }) };
  const result = await runCommonCrawlerSource({ source: { sourceId: "fixture", sourceName: "Fixture", listUrl: "https://example.invalid/list" }, inventoryRows: [{ source_id: "fixture" }], strategy, fetchHtml: async () => "fixture", fetchDetails: false });
  assert.equal(result.notices[0].marker, "legacy"); assert.equal("document_extraction_results" in result.notices[0], false);
});
test("document parsing runtime is strict opt-in and disabled by default", async () => {
  assert.equal(isDocumentParsingEnabled(undefined), false);
  assert.equal(isDocumentParsingEnabled("1"), false);
  assert.equal(isDocumentParsingEnabled("true"), true);
  const runtime = createCrawlerDocumentRuntime();
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.registry, null);
  assert.equal(runtime.processNoticeDocuments, null);
  const result = await runCommonCrawlerSource({
    source: { sourceId: "fixture", sourceName: "Fixture", listUrl: "https://example.invalid/list" },
    inventoryRows: [{ source_id: "fixture" }],
    strategy: { parseList: () => [{ noticeUrl: "https://example.invalid/n" }], normalizeNotice: ({ item }) => ({ ...item, marker: "legacy" }) },
    fetchHtml: async () => "fixture",
    fetchDetails: false,
    processNoticeDocuments: runtime.processNoticeDocuments,
  });
  assert.equal(result.notices[0].marker, "legacy");
  assert.equal("document_extraction_results" in result.notices[0], false);
});
test("authoritative crawl runtime executes the common-runner document hook", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "engine-phase-3-authoritative-"));
  try {
    const runtime = createAuthoritativeDocumentRuntime({ enabled: true, cacheDirectory: directory, inspectAsset: null, fetchAsset: null });
    const strategy = createGenericHtmlStrategy({ parseListHtml: () => [{ title: "Notice", noticeUrl: "https://example.invalid/n" }] });
    const result = await runCommonCrawlerSource({
      source: { sourceId: "fixture", sourceName: "Fixture", listUrl: "https://example.invalid/list" },
      inventoryRows: [{ source_id: "fixture" }],
      strategy,
      fetchHtml: async (url) => url.endsWith("/list") ? "<a>list</a>" : longHtml,
      processNoticeDocuments: runtime.processNoticeDocuments,
    });
    const notice = result.notices[0];
    assert.equal(result.result_status, "success");
    assert.equal(notice.document_extraction_results.length, 1);
    assert.equal(notice.document_quality_summary.document_count, 1);
    assert.equal(notice.normalized_payload.engine_phase_3.document_count, 1);
    assert.equal(runtime.registry.parserInvocationCount, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("persistent parser cache survives a fresh runtime registry", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "engine-phase-3-persistent-"));
  const request = { source: { sourceId: "fixture" }, detailHtml: longHtml, notice: { source_id: "fixture", noticeUrl: "https://example.invalid/n", body: "Readable notice body" } };
  try {
    const firstRuntime = createCrawlerDocumentRuntime({ enabled: true, cacheDirectory: directory });
    const first = await firstRuntime.processNoticeDocuments(request);
    const replayRuntime = createCrawlerDocumentRuntime({ enabled: true, cacheDirectory: directory });
    const replay = await replayRuntime.processNoticeDocuments(request);
    assert.equal(first.document_extraction_results[0].cache_status, "miss");
    assert.equal(replay.document_extraction_results[0].cache_status, "hit_success");
    assert.equal(replayRuntime.registry.parserInvocationCount, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("authoritative asset transport enforces the byte bound", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(Buffer.alloc(6), { status: 200, headers: { "content-length": "6", "content-type": "application/pdf" } });
  try {
    await assert.rejects(
      fetchUrlWithMetadata("https://example.invalid/a.pdf", { maxBytes: 5, retryCount: 0, timeoutMs: 100 }),
      (error) => error?.code === "bounded_limit_exceeded",
    );
  } finally { globalThis.fetch = originalFetch; }
});
test("authoritative asset transport returns validators and final metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const response = new Response(Buffer.from("fixture"), { status: 200, headers: { etag: "fixture-v1", "last-modified": "Thu, 17 Jul 2026 00:00:00 GMT", "content-length": "7", "content-type": "text/plain" } });
    Object.defineProperty(response, "url", { value: "https://example.invalid/final.txt" });
    return response;
  };
  try {
    const result = await fetchUrlWithMetadata("https://example.invalid/a.txt", { maxBytes: 10, retryCount: 0, timeoutMs: 100 });
    assert.equal(result.finalUrl, "https://example.invalid/final.txt");
    assert.equal(result.etag, "fixture-v1");
    assert.equal(result.contentLength, 7);
    assert.equal(result.bytes.toString(), "fixture");
  } finally { globalThis.fetch = originalFetch; }
});
test("document evidence handoff is compact and excludes extracted content", async () => {
  const processor = createNoticeDocumentProcessor({ registry: createDocumentParserRegistry() });
  const notice = await processor({ source: { sourceId: "fixture" }, detailHtml: longHtml, notice: { source_id: "fixture", noticeUrl: "https://example.invalid/n", body: "Readable notice body", normalized_payload: { existing: true } } });
  const payload = notice.normalized_payload.engine_phase_3;
  const serialized = JSON.stringify(payload);
  assert.equal(notice.normalized_payload.existing, true);
  assert.equal(payload.document_count, 1);
  assert.match(payload.documents[0].byte_sha256, /^[a-f0-9]{64}$/);
  assert.equal("extracted_text" in payload.documents[0], false);
  assert.equal("normalized_text" in payload.documents[0], false);
  assert.doesNotMatch(serialized, /Synthetic Scholarship Notice/);
  assert.equal(summarizeNoticeDocumentEvidence(notice).document_count, 1);
});
test("normalized graph carries compact Engine Phase 3 payload without changing identity", async () => {
  const runtime = createCrawlerDocumentRuntime({ enabled: true });
  const strategy = createGenericHtmlStrategy({ parseListHtml: () => [{ title: "Notice", noticeUrl: "https://example.invalid/n" }] });
  const result = await runBoundedCrawlerSource({
    source: { sourceId: "fixture", sourceName: "Fixture", listUrl: "https://example.invalid/list" },
    inventoryRows: [{ source_id: "fixture" }],
    strategy,
    fetchHtml: async (url) => url.endsWith("/list") ? "<a>list</a>" : longHtml,
    processNoticeDocuments: runtime.processNoticeDocuments,
    retryCount: 0,
  });
  const input = {
    generated_at: "2026-07-17T00:00:00.000Z",
    run: { idempotency_key: "engine-phase-3-graph", execution_mode: "fixture" },
    source_results: [result],
  };
  const plan = buildNormalizedGraphPlan(input, { generatedAt: input.generated_at });
  const revision = plan.tables.ingestion_notice_revisions[0];
  const graphNotice = plan.tables.ingestion_notices[0];
  assert.equal(graphNotice.canonical_url, "https://example.invalid/n");
  assert.equal(revision.normalized_payload.engine_phase_3.contract_version, "engine-phase-3-document-result/v1");
  assert.equal(revision.normalized_payload.engine_phase_3.documents[0].detected_format, "html");
  assert.equal("extracted_text" in revision.normalized_payload.engine_phase_3.documents[0], false);
  assert.deepEqual(Object.keys(plan.tables).sort(), ["crawled_notices_compatibility", "ingestion_crawl_runs", "ingestion_notice_assets", "ingestion_notice_occurrences", "ingestion_notice_revisions", "ingestion_notice_url_aliases", "ingestion_notices", "ingestion_source_run_results", "review_items"].sort());
});
test("PDF attachment fingerprint is linked compactly without raw bytes", async () => {
  const bytes = await textPdf(["Synthetic PDF attachment scholarship eligibility and deadline evidence."]);
  const processor = createNoticeDocumentProcessor({
    registry: createDocumentParserRegistry(),
    fetchAsset: async () => ({ bytes, finalUrl: "https://example.invalid/a.pdf", mimeType: "application/pdf" }),
  });
  const notice = await processor({ source: { sourceId: "fixture" }, notice: { source_id: "fixture", noticeUrl: "https://example.invalid/n", body: "Readable body", attachment_metadata: [{ url: "https://example.invalid/a.pdf", filename: "a.pdf" }] } });
  const attachment = notice.normalized_payload.engine_phase_3.documents.find((document) => document.detected_format === "pdf");
  assert.equal(attachment.original_url, "https://example.invalid/a.pdf");
  assert.match(attachment.byte_sha256, /^[a-f0-9]{64}$/);
  assert.equal("bytes" in attachment, false);
  assert.equal("extracted_text" in attachment, false);
});
test("legacy pilot adapter preserves Engine Phase 3 normalized payload", () => {
  const phase3 = { contract_version: "engine-phase-3-document-result/v1", document_count: 1, documents: [] };
  const normalized = normalizePilotInput({
    runAt: "2026-07-17T00:00:00.000Z",
    perSource: [{ sourceId: "fixture", sourceName: "Fixture", crawledCount: 1, matchedCount: 1 }],
    newNotices: [{ sourceId: "fixture", title: "Notice", noticeUrl: "https://example.invalid/n", content: "Body", normalized_payload: { engine_phase_3: phase3 } }],
  });
  assert.deepEqual(normalized.source_results[0].notices[0].normalized_payload.engine_phase_3, phase3);
});

let passed = 0;
const scenarioResults = [];
for (const entry of tests) {
  try {
    await entry.operation();
    passed += 1;
    scenarioResults.push({ name: entry.name, passed: true });
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    scenarioResults.push({ name: entry.name, passed: false, error: String(error?.message ?? error).slice(0, 200) });
    console.error(`FAIL ${entry.name}`);
    console.error(error);
  }
}
console.log(`Engine Phase 3 document parsing tests: ${passed}/${tests.length} PASS`);
const jsonArgument = process.argv.find((value) => value.startsWith("--json="));
if (jsonArgument) {
  const outputPath = path.resolve(jsonArgument.slice("--json=".length));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    phase: "engine-phase-3",
    scenario_count: tests.length,
    passed_count: passed,
    failed_count: tests.length - passed,
    deterministic_rerun_match: scenarioResults.find((entry) => entry.name === "fixture rerun is structurally deterministic")?.passed === true,
    scenario_results: scenarioResults,
    generated_at: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
}
if (passed !== tests.length) process.exitCode = 1;
