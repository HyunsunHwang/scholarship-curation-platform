import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runCommonCrawler,
  runCommonCrawlerSource,
} from "../lib/crawler-engine/common-runner.mjs";
import {
  CRAWLER_RESULT_STATUSES,
  deterministicCrawlerProjection,
} from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import { buildNormalizedGraphPlan } from "../lib/post-phase-l/normalized-graph.mjs";
import { mapRawSource } from "../lib/notice-sources-loader.mjs";
import { extractFromList } from "./crawl-scholarship-notices.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => fs.readFileSync(path.join(root, "fixtures", "engine-phase-1", name), "utf8");
const strategy = createGenericHtmlStrategy({ parseListHtml: extractFromList });

const sources = [
  mapRawSource({
    source_id: "ewha_010",
    source_name: "이화여대 휴먼기계바이오공학과",
    list_url: "https://mbe.ewha.ac.kr/mbeadmin/community/notice.do",
    base_url: "https://mbe.ewha.ac.kr",
    list_item_selector: ".notice-list li",
    link_selector: "a[href]",
    title_selector: "a[href]",
    date_selector: ".date",
    detail_content_selector: ".board-view",
    notice_url_pattern: "(mode=view|articleNo=)",
  }),
  mapRawSource({
    source_id: "uos_002",
    source_name: "시립대 국사학과",
    list_url: "https://www.uos.ac.kr/liberalarts/korNotice/allList.do?list_id=human01",
    base_url: "https://www.uos.ac.kr",
    list_item_selector: "tbody tr",
    link_selector: "a[href]",
    title_selector: "a[href]",
    date_selector: ".date",
    detail_content_selector: ".view-content",
    notice_url_pattern: "(mode=view|articleNo=)",
  }),
];
const inventoryRows = sources.map((source) => ({ source_id: source.sourceId }));
const responseByUrl = new Map([
  [sources[0].listUrl, fixture("ewha-list.html")],
  ["https://mbe.ewha.ac.kr/mbeadmin/community/notice.do?mode=view&articleNo=42&utm_source=fixture", fixture("ewha-detail.html")],
  [sources[1].listUrl, fixture("uos-list.html")],
  ["https://www.uos.ac.kr/liberalarts/korNotice/view.do?mode=view&articleNo=77", fixture("uos-detail.html")],
]);
const fetchFixture = async (url) => {
  if (!responseByUrl.has(url)) throw new Error(`Unexpected fixture URL: ${url}`);
  return responseByUrl.get(url);
};

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await test("failure status contract is complete", () => {
  assert.deepEqual(CRAWLER_RESULT_STATUSES, [
    "success", "empty_observed", "partial", "timeout", "network_error", "http_error", "parser_error",
    "configuration_error", "source_resolution_error", "unsupported",
  ]);
});

const fixedRun = {
  idempotency_key: "engine-phase-1-fixture-v1",
  execution_mode: "fixture",
  started_at: "2026-07-17T00:00:00.000Z",
  finished_at: "2026-07-17T00:00:01.000Z",
  metadata: { bounded: true, database_write_count: 0, external_llm_call_count: 0 },
};
const execute = () => runCommonCrawler({
  sources,
  inventoryRows,
  strategyResolver: () => strategy,
  fetchHtml: fetchFixture,
  run: fixedRun,
  options: { maxItems: 1, fetchDetails: true },
});
const result = await execute();

await test("two sources share one generic strategy", () => {
  assert.equal(result.source_results.length, 2);
  assert.deepEqual(result.source_results.map((row) => row.strategy), ["generic_html", "generic_html"]);
  assert.deepEqual(result.source_results.map((row) => row.result_status), ["success", "success"]);
});

await test("source-specific selector configs extract titles and dates", () => {
  assert.equal(result.source_results[0].notices[0].title, "2026-1 장학금 신청 안내");
  assert.equal(result.source_results[0].notices[0].dateText, "2026-07-10");
  assert.equal(result.source_results[1].notices[0].dateText, "2026.07.11");
});

await test("detail body and attachment metadata are retained", () => {
  for (const sourceResult of result.source_results) {
    assert.ok(sourceResult.notices[0].body.length > 80);
    assert.equal(sourceResult.notices[0].attachment_metadata.length, 1);
  }
});

await test("URL normalization removes tracking parameters", () => {
  assert.equal(
    result.source_results[0].notices[0].canonical_url,
    "https://mbe.ewha.ac.kr/mbeadmin/community/notice.do?articleNo=42&mode=view",
  );
});

await test("output feeds the authoritative normalized graph", () => {
  const plan = buildNormalizedGraphPlan(result, { generatedAt: fixedRun.finished_at });
  assert.equal(plan.tables.ingestion_source_run_results.length, 2);
  assert.equal(plan.tables.ingestion_notices.length, 2);
  assert.equal(plan.tables.crawled_notices_compatibility.length, 2);
  assert.equal(plan.writes_performed, false);
});

await test("fixture rerun is deterministic", async () => {
  assert.deepEqual(
    deterministicCrawlerProjection(await execute()),
    deterministicCrawlerProjection(result),
  );
});

await test("legacy parser parity is preserved", () => {
  for (const source of sources) {
    const html = responseByUrl.get(source.listUrl);
    const legacy = extractFromList(source, html);
    const common = result.source_results.find((row) => row.source_id === source.sourceId).notices;
    assert.deepEqual(
      common.map(({ title, noticeUrl, dateText }) => ({ title, noticeUrl, dateText })),
      legacy.slice(0, 1).map(({ title, noticeUrl, dateText }) => ({ title, noticeUrl, dateText })),
    );
  }
});

await test("malformed source config fails closed", async () => {
  const malformed = await runCommonCrawlerSource({
    source: { sourceId: "bad", sourceName: "Bad", listUrl: "not-a-url" },
    inventoryRows: [{ source_id: "bad" }], strategy, fetchHtml: fetchFixture,
  });
  assert.equal(malformed.result_status, "configuration_error");
});

await test("unresolved source_key fails closed", async () => {
  const unresolved = await runCommonCrawlerSource({
    source: sources[0], inventoryRows: [], strategy, fetchHtml: fetchFixture,
  });
  assert.equal(unresolved.result_status, "source_resolution_error");
  assert.equal(unresolved.source_id, null);
});

await test("unsupported strategy is explicit", async () => {
  const unsupported = await runCommonCrawlerSource({
    source: sources[0], inventoryRows, strategy: null, fetchHtml: fetchFixture,
  });
  assert.equal(unsupported.result_status, "unsupported");
});

await test("HTTP transport failure is distinguished", async () => {
  const httpError = Object.assign(new Error("HTTP 503"), { httpStatus: 503 });
  const failed = await runCommonCrawlerSource({
    source: sources[0], inventoryRows, strategy, fetchHtml: async () => { throw httpError; },
  });
  assert.equal(failed.result_status, "http_error");
});

await test("network transport failure is distinguished", async () => {
  const failed = await runCommonCrawlerSource({
    source: sources[0], inventoryRows, strategy,
    fetchHtml: async () => { throw new TypeError("fetch failed"); },
  });
  assert.equal(failed.result_status, "network_error");
});

await test("parser failure is distinguished", async () => {
  const failed = await runCommonCrawlerSource({
    source: sources[0], inventoryRows,
    strategy: { ...strategy, parseList() { throw new Error("bad markup"); } },
    fetchHtml: async () => "<html></html>",
  });
  assert.equal(failed.result_status, "parser_error");
});

await test("empty observation is not promoted to success", async () => {
  const empty = await runCommonCrawlerSource({
    source: sources[0], inventoryRows, strategy, fetchHtml: async () => "<html></html>",
  });
  assert.equal(empty.result_status, "empty_observed");
});

console.log(`Engine Phase 1 common crawler tests: ${passed}/${passed} PASS`);
