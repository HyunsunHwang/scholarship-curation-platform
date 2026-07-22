import assert from "node:assert/strict";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import {
  OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS,
  analyzeOperationalCrawlerSource,
  buildCrawlerReport,
  buildOperationalCrawlDiagnostics,
  buildOperationalCrawlDiagnosticsCsv,
  normalizeOperationalTitleForIdentity,
  stripOperationalNoticePrefix,
  validateOperationalCrawlDiagnostics,
  verifyOperationalDetailTitleIdentity,
} from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
import { extractFromList } from "./crawl-scholarship-notices.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("notice-only prefixes normalize across list and detail titles", () => {
  const identity = verifyOperationalDetailTitleIdentity(
    "공통 2026학년도 2학기 장학금 신청 안내",
    ["[장학] 2026학년도 2학기 장학금 신청 안내"],
  );
  assert.equal(identity.verified, true);
  assert.equal(identity.comparison_mode, "notice_prefix_stripped_exact");
});

test("repeated list and detail prefixes are removed deterministically", () => {
  assert.equal(
    stripOperationalNoticePrefix("[공지] [장학] 공통 1. 신규 2026 장학금 안내"),
    "2026 장학금 안내",
  );
});

test("meaningful bracketed title content is retained", () => {
  assert.equal(normalizeOperationalTitleForIdentity("[학부생] 연구 장학금 안내").includes("학부생"), true);
  assert.equal(
    verifyOperationalDetailTitleIdentity("[학부생] 연구 장학금 안내", ["[학부생] 연구 장학금 안내"]).verified,
    true,
  );
});

test("different list and detail titles remain unverified", () => {
  const identity = verifyOperationalDetailTitleIdentity("2026 장학금 안내", ["2026 교환학생 모집"]);
  assert.equal(identity.verified, false);
  assert.equal(identity.status, "title_mismatch");
});

test("Kyunghee-style detail title selector is collected before body cleanup", () => {
  const strategy = createGenericHtmlStrategy({ parseListHtml: extractFromList });
  const detail = strategy.parseDetail({
    source: { sourceId: "khu_fixture", detailContentSelector: ".body" },
    item: { title: "공통 장학금 안내", noticeUrl: "https://example.test/notice/1" },
    html: "<section class='bbs-view'><header class='top'><h2 class='t'>[장학] 장학금 안내</h2></header><div class='body'>장학금 신청 본문 내용입니다. 충분히 긴 본문을 둡니다.</div></section>",
  });
  assert.equal(detail.detailTitle, "[장학] 장학금 안내");
  assert.equal(detail.detailIdentity.verified, true);
});

test("Sungkyunkwan-style list selector is observed without changing list extraction", () => {
  const source = {
    sourceId: "skku_fixture",
    sourceName: "Fixture",
    listUrl: "https://example.test/notices",
    baseUrl: "https://example.test",
    noticeUrlPattern: "articleNo=",
  };
  const items = extractFromList(
    source,
    "<ul class='board-list-wrap'><li><a href='/notice?articleNo=1'>장학금 공지</a><span class='date'>2026-07-22</span></li></ul>",
  );
  assert.equal(items.length, 1);
  assert.equal(items.operational_parser_evidence.matched_list_selector, ".board-list-wrap > li");
  assert.equal(items.operational_parser_evidence.selector_match_count, 1);
});

test("operational diagnostics use existing execution evidence only", () => {
  const input = {
    sources: [{
      source: { sourceId: "fixture", sourceName: "Fixture", universitySlug: "fixture", sourceLevel: "university" },
      executionResult: {
        source_key: "fixture",
        result_status: "success",
        observed_count: 1,
        parser_evidence: { valid_detail_url_count: 1, parsed_candidate_count: 1, pagination_evidence_count: 0 },
      },
      notices: [{
        title: "공통 장학금 안내",
        content: "충분히 긴 상세 본문입니다. 장학금 지원 자격과 신청 절차를 안내합니다.",
        detailIdentity: { verified: true },
      }],
      matchedCount: 1,
    }],
  };
  const first = buildOperationalCrawlDiagnostics(input);
  const second = buildOperationalCrawlDiagnostics(input);
  assert.deepEqual(first, second);
  assert.deepEqual(validateOperationalCrawlDiagnostics(first), { valid: true, errors: [] });
  assert.equal(first.source_diagnostics[0].capability_status, "supported");
  assert.equal("transport_error_category" in first.source_diagnostics[0], false);
  const csv = buildOperationalCrawlDiagnosticsCsv(first);
  assert.equal(csv.startsWith(`\uFEFF${OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS.join(",")}`), true);
  assert.equal(analyzeOperationalCrawlerSource(input.sources[0]).recommended_action, "none");
});

test("keyword and date filters remain separately observable", () => {
  const base = {
    source: { sourceId: "filter_fixture" },
    executionResult: { result_status: "success", observed_count: 1 },
    notices: [{ detailIdentity: { verified: true }, content: "충분히 긴 본문입니다. 장학금 안내를 포함합니다." }],
    matchedCount: 0,
  };
  assert.equal(
    analyzeOperationalCrawlerSource({ ...base, filterMetrics: { keyword_match_count: 0, date_match_count: 0 } }).primary_failure_code,
    "FILTERED_OUT_BY_KEYWORD",
  );
  assert.equal(
    analyzeOperationalCrawlerSource({ ...base, filterMetrics: { keyword_match_count: 1, date_match_count: 0 } }).primary_failure_code,
    "FILTERED_OUT_BY_DATE",
  );
});

test("report keeps existing safety contract while adding operational diagnostics", () => {
  const diagnostics = buildOperationalCrawlDiagnostics({ sources: [] });
  const report = buildCrawlerReport({
    runAt: "2026-07-22T00:00:00.000Z",
    executionResults: [{ source_key: "fixture", notices: [{ hidden: true }] }],
    operationalDiagnostics: diagnostics,
  });
  assert.equal(report.safety.databaseWritePerformed, false);
  assert.equal(report.safety.productionAccessPerformed, false);
  assert.equal(report.safety.externalLlmCallCount, 0);
  assert.equal("notices" in report.boundedExecution.sources[0], false);
  assert.deepEqual(report.operationalDiagnostics, diagnostics);
});

console.log(`Operational crawl diagnostics tests: ${passed}/${passed} PASS`);
