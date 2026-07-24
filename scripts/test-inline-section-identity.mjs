import assert from "node:assert/strict";
import { extractInlineSectionNotices } from "../lib/crawler-adapters/inline-section-adapter.mjs";
import { buildCrawlerWorkItemKey } from "../lib/crawler-engine/checkpoint.mjs";
import { runCommonCrawlerSource } from "../lib/crawler-engine/common-runner.mjs";
import { analyzeOperationalCrawlerSource } from "../lib/crawler-engine/runtime-diagnostics/operational-crawl-failure-analyzer.mjs";
import { buildNormalizedGraphPlan } from "../lib/post-phase-l/normalized-graph.mjs";

const source = Object.freeze({
  sourceId: "inline_fixture_a",
  sourceName: "Inline fixture",
  universitySlug: "fixture",
  listUrl: "https://example.test/notices",
  baseUrl: "https://example.test",
  contentMode: "inline_sections",
  detailContentAlreadyAvailable: true,
  sectionTitleSelector: "h2",
  sectionBodyBoundary: "next_heading",
});

const html = `
  <h2>2026 Scholarship notice</h2>
  <p>Application period: 2026-07-20 to 2026-08-07. This is a sufficiently long authoritative body for the first notice.</p>
  <a href="/files/guide-a.pdf">Guide attachment</a><a href="https://forms.example.test/a">Application form</a>
  <h2>2026 Scholarship notice</h2>
  <p>Result date: 2026-08-10. This is a sufficiently long authoritative body for the second notice.</p>
  <a href="/files/guide-b.pdf">Result attachment</a>
  <h2>Different scholarship notice</h2>
  <p>Payment date: 2026-08-20. This is a sufficiently long authoritative body for the third notice.</p>`;

const notices = extractInlineSectionNotices(source, html);
assert.equal(notices.length, 3);
assert.equal(new Set(notices.map((notice) => notice.inline_section_id ?? notice.inlineSectionId)).size, 3);
assert.equal(new Set(notices.map((notice) => notice.noticeUrl)).size, 3);
assert.equal(new Set(notices.map((notice) => buildCrawlerWorkItemKey(source.sourceId, notice))).size, 3);
assert.ok(notices.every((notice) => notice.canonical_url === source.listUrl));
assert.ok(notices.every((notice) => !notice.dateText && !notice.detailDate));
assert.ok(notices[0].attachmentMetadata.length === 1);
assert.equal(notices[0].applicationLinks.length, 1);

const rerun = extractInlineSectionNotices(source, html);
assert.deepEqual(
  notices.map((notice) => notice.inline_section_id).sort(),
  rerun.map((notice) => notice.inline_section_id).sort(),
);
const reordered = extractInlineSectionNotices(source, html.split(/(?=<h2>)/u).reverse().join(""));
assert.deepEqual(
  notices.map((notice) => notice.inline_section_id).sort(),
  reordered.map((notice) => notice.inline_section_id).sort(),
);
assert.notEqual(
  buildCrawlerWorkItemKey("inline_fixture_a", { inline_section_id: "inline-shared", canonical_url: source.listUrl }),
  buildCrawlerWorkItemKey("inline_fixture_b", { inline_section_id: "inline-shared", canonical_url: source.listUrl }),
);
assert.equal(
  buildCrawlerWorkItemKey("external", { noticeUrl: "https://example.test/n?articleNo=7" }),
  buildCrawlerWorkItemKey("external", { noticeUrl: "https://example.test/n?articleNo=7#ignored" }),
);

const result = await runCommonCrawlerSource({
  source,
  inventoryRows: [{ source_id: source.sourceId }],
  fetchDetails: false,
  listUrls: [source.listUrl],
  fetchHtml: async () => html,
  strategy: {
    parseList: () => notices,
    resolveDetailUrl: ({ item }) => item.noticeUrl,
    normalizeNotice: ({ item, detail, attachmentMetadata }) => ({ ...item, ...detail, attachmentMetadata, attachment_metadata: attachmentMetadata }),
  },
});
assert.ok(result.notices.every((notice) => notice.attachmentMetadata.length > 0 || notice.title === "Different scholarship notice"));
assert.equal(result.item_summary.checkpoint_work_item_unique_count, 3);

const graph = buildNormalizedGraphPlan({
  run: { idempotency_key: "inline-identity-fixture" },
  source_results: [{ source_key: source.sourceId, source_id: source.sourceId, notices: result.notices }],
}, { generatedAt: "2026-07-24T00:00:00.000Z" });
assert.equal(graph.tables.ingestion_notices.length, 3);
assert.equal(new Set(graph.tables.ingestion_notices.map((row) => row.id)).size, 3);
assert.ok(graph.tables.ingestion_notices.every((row) => row.identity_kind === "inline_section_id"));
assert.equal(new Set(graph.tables.ingestion_notice_url_aliases.map((row) => row.id)).size, graph.tables.ingestion_notice_url_aliases.length);

const revised = structuredClone(result.notices);
revised[0].body = `${revised[0].body} Editorial body correction.`;
const revisedGraph = buildNormalizedGraphPlan({
  run: { idempotency_key: "inline-identity-revision" },
  source_results: [{ source_key: source.sourceId, source_id: source.sourceId, notices: revised }],
}, { generatedAt: "2026-07-24T00:00:00.000Z" });
assert.equal(revisedGraph.tables.ingestion_notices[0].id, graph.tables.ingestion_notices[0].id);
assert.notEqual(revisedGraph.tables.ingestion_notice_revisions[0].id, graph.tables.ingestion_notice_revisions[0].id);

const collisionDiagnostic = analyzeOperationalCrawlerSource({
  source,
  executionResult: { result_status: "success", observed_count: 2, item_summary: { checkpoint_work_item_unique_count: 1 }, parser_evidence: { inline_section_identity_count: 2 } },
  notices: [{ inline_section_id: "same" }, { inline_section_id: "same" }],
  matchedCount: 0,
});
assert.ok(collisionDiagnostic.operational_codes.includes("INLINE_SECTION_IDENTITY_COLLISION"));
assert.notEqual(collisionDiagnostic.capability_status, "supported");

console.log("PASS inline section identity, date evidence, attachment preservation, checkpoint, graph, and diagnostics");
