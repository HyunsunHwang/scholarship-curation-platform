import assert from "node:assert/strict";
import { runCommonCrawlerSource } from "../lib/crawler-engine/common-runner.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import {
  OPERATIONAL_COMMON_LIST_SELECTORS,
} from "../lib/crawler-engine/operational-parser-evidence.mjs";
import {
  OPERATIONAL_ACCESS_PROFILES,
  OPERATIONAL_CAPABILITY_STATUSES,
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

test("common-board extraction excludes navigation links and records complete parser metrics", () => {
  const source = {
    sourceId: "common_board_fixture",
    sourceName: "Fixture",
    listUrl: "https://example.test/notices",
    baseUrl: "https://example.test",
  };
  const items = extractFromList(source, [
    "<header><a href='/notice?articleNo=99'>Menu notice link</a></header>",
    "<ul class='board-list-wrap'><li><a href='/notice?articleNo=1'>Scholarship notice</a><span class='date'>2026-07-22</span></li></ul>",
  ].join(""));
  const evidence = items.operational_parser_evidence;
  assert.equal(OPERATIONAL_COMMON_LIST_SELECTORS.includes(evidence.matched_list_selector), true);
  assert.deepEqual(items.map((item) => item.noticeUrl), ["https://example.test/notice?articleNo=1"]);
  assert.equal(evidence.parser_strategy, "common_board_selector");
  assert.equal(evidence.list_candidate_count, 1);
  assert.equal(evidence.title_extract_count, 1);
  assert.equal(evidence.date_extract_count, 1);
  assert.equal(evidence.raw_navigation_count, 1);
  assert.equal(evidence.contaminated_candidate_count >= 1, true);
  assert.equal(evidence.contaminated_candidate_leak_count, 0);
  assert.equal(evidence.parser_fallback_recovered, true);
});

test("configured selectors take priority and heuristic fallback remains available", () => {
  const source = {
    sourceId: "selector_priority_fixture",
    sourceName: "Fixture",
    listUrl: "https://example.test/notices",
    baseUrl: "https://example.test",
    listItemSelector: ".configured > li",
  };
  const configured = extractFromList(source, [
    "<ul class='configured'><li><a href='/notice?articleNo=1'>Configured</a></li></ul>",
    "<ul class='board-list-wrap'><li><a href='/notice?articleNo=2'>Common</a></li></ul>",
  ].join(""));
  assert.deepEqual(configured.map((item) => item.title), ["Configured"]);
  assert.equal(configured.operational_parser_evidence.parser_strategy, "configured_selector");

  const heuristic = extractFromList({ ...source, sourceId: "heuristic_fixture", listItemSelector: "" },
    "<main><a href='/notice?articleNo=3'>Heuristic notice</a></main>");
  assert.deepEqual(heuristic.map((item) => item.title), ["Heuristic notice"]);
  assert.equal(heuristic.operational_parser_evidence.parser_strategy, "heuristic_anchor");
  assert.equal(heuristic.operational_parser_evidence.fallback_scan_used, true);
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
  assert.deepEqual(csv.slice(1).split("\r\n")[0].split(","), OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS);
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

test("all nine capability statuses are reachable from explicit evidence", () => {
  const longContent = "Authoritative detail content with enough characters for operational verification.";
  const base = {
    source: { sourceId: "status_fixture" },
    executionResult: {
      result_status: "success",
      observed_count: 1,
      parser_evidence: {
        parser_strategy: "configured_selector",
        configured_list_selector: ".row",
        selector_match_count: 1,
        list_candidate_count: 1,
        title_extract_count: 1,
        date_extract_count: 1,
        resolved_detail_url_count: 1,
        valid_detail_url_count: 1,
        pagination_evidence_count: 0,
      },
    },
    notices: [{ content: longContent, detailIdentity: { verified: true } }],
    filterMetrics: { parsed_date_count: 1, keyword_match_count: 1, date_match_count: 1 },
    matchedCount: 1,
  };
  const cases = [
    ["supported", base],
    ["list_supported_detail_unverified", {
      ...base,
      source: { sourceId: "unverified" },
      notices: [{ content: longContent }],
    }],
    ["list_supported_detail_failed", {
      ...base,
      source: { sourceId: "detail_failed" },
      notices: [{ content: "", detailResultStatus: "network_error" }],
    }],
    ["posts_found_no_scholarship", {
      ...base,
      source: { sourceId: "no_scholarship" },
      filterMetrics: { parsed_date_count: 1, keyword_match_count: 0, date_match_count: 0 },
      matchedCount: 0,
    }],
    ["no_posts_detected", {
      source: { sourceId: "no_posts" },
      executionResult: {
        result_status: "empty_observed",
        observed_count: 0,
        parser_evidence: { parser_strategy: "heuristic_anchor", list_candidate_count: 0, title_extract_count: 0, date_extract_count: 0, resolved_detail_url_count: 0, valid_detail_url_count: 0 },
      },
      notices: [],
      filterMetrics: { parsed_date_count: 0, keyword_match_count: 0, date_match_count: 0 },
      matchedCount: 0,
    }],
    ["valid_zero_candidates", {
      ...base,
      source: { sourceId: "date_filtered" },
      filterMetrics: { parsed_date_count: 1, keyword_match_count: 1, date_match_count: 0 },
      matchedCount: 0,
    }],
    ["config_or_selector_fix", {
      source: { sourceId: "selector_failed" },
      executionResult: {
        result_status: "empty_observed",
        observed_count: 0,
        parser_evidence: { configured_list_selector: ".missing", selector_match_count: 0, list_candidate_count: 0 },
      },
      notices: [],
      matchedCount: 0,
    }],
    ["adapter_required", {
      source: { sourceId: "client_rendered" },
      executionResult: {
        result_status: "empty_observed",
        observed_count: 0,
        parser_evidence: { list_candidate_count: 0, client_rendered_marker_detected: true },
      },
      notices: [],
      matchedCount: 0,
    }],
    ["manual_review_required", {
      source: { sourceId: "unknown_failure" },
      executionResult: { result_status: "network_error", observed_count: 0 },
    }],
  ];
  const actual = cases.map(([expected, input]) => {
    const row = analyzeOperationalCrawlerSource(input);
    assert.equal(row.capability_status, expected);
    assert.equal(row.evidence_summary.length > 0, true);
    if (["config_or_selector_fix", "adapter_required", "manual_review_required"].includes(expected)) {
      assert.equal(typeof row.manual_review_question, "string");
    }
    return row.capability_status;
  });
  assert.deepEqual(new Set(actual), new Set(OPERATIONAL_CAPABILITY_STATUSES));
});

test("stage entries reflect actual success, failure, skipped, and unobserved states", () => {
  const supported = analyzeOperationalCrawlerSource({
    source: { sourceId: "stage_success" },
    executionResult: {
      result_status: "success",
      observed_count: 1,
      parser_evidence: {
        parser_strategy: "configured_selector", configured_list_selector: ".row", selector_match_count: 1,
        list_candidate_count: 1, title_extract_count: 1, date_extract_count: 1,
        resolved_detail_url_count: 1, valid_detail_url_count: 1, pagination_evidence_count: 0,
      },
    },
    notices: [{ content: "Long authoritative detail content for stage verification.", detailIdentity: { verified: true } }],
    filterMetrics: { parsed_date_count: 1, keyword_match_count: 1, date_match_count: 1 },
    matchedCount: 1,
  });
  const stages = Object.fromEntries(supported.stage_entries.map((entry) => [entry.stage, entry.status]));
  assert.equal(stages.list_fetch, "success");
  assert.equal(stages.list_parse, "success");
  assert.equal(stages.notice_url_resolution, "success");
  assert.equal(stages.pagination_check, "skipped");
  assert.equal(stages.detail_fetch, "success");
  assert.equal(stages.detail_content_extract, "success");
  assert.equal(stages.candidate_filter, "success");
  assert.equal(stages.final_result, "success");

  const failed = analyzeOperationalCrawlerSource({
    source: { sourceId: "stage_failed" },
    executionResult: { result_status: "timeout", observed_count: 0 },
  });
  const failedStages = Object.fromEntries(failed.stage_entries.map((entry) => [entry.stage, entry.status]));
  assert.equal(failedStages.list_fetch, "failed");
  assert.equal(failedStages.list_decode, "skipped");
  assert.equal(failedStages.list_parse, "skipped");
  assert.equal(failedStages.candidate_filter, "not_observed");
  assert.equal(failedStages.final_result, "manual_review_required");
});

test("verified adapters use declared profiles without requiring HTML title identity", () => {
  const jsonAdapter = analyzeOperationalCrawlerSource({
    source: { sourceId: "json_adapter", adapter: "cau_portal" },
    executionResult: {
      result_status: "success",
      observed_count: 1,
      adapter_evidence: {
        adapter_capability_verified: true,
        adapter_provides_authoritative_detail: true,
        adapter_access_profile: "JSON_XHR_API",
      },
    },
    notices: [{ title: "Authoritative API title", content: "API supplied body" }],
    filterMetrics: { parsed_date_count: 1, keyword_match_count: 1, date_match_count: 1 },
    matchedCount: 1,
  });
  assert.equal(jsonAdapter.capability_status, "supported");
  assert.deepEqual(jsonAdapter.access_profiles, [OPERATIONAL_ACCESS_PROFILES.JSON_XHR_API]);
  assert.equal(jsonAdapter.operational_codes.includes("DETAIL_URL_UNVERIFIED"), false);

  const formAdapter = analyzeOperationalCrawlerSource({
    source: { sourceId: "form_adapter", adapter: "form_adapter" },
    executionResult: {
      result_status: "success",
      observed_count: 1,
      adapter_evidence: {
        adapter_capability_verified: true,
        adapter_provides_authoritative_detail: true,
        adapter_access_profile: "FORM_POST_REDIRECT",
      },
    },
    notices: [{ title: "Form result", content: "Form supplied body" }],
    matchedCount: 1,
  });
  assert.deepEqual(formAdapter.access_profiles, [OPERATIONAL_ACCESS_PROFILES.FORM_POST_REDIRECT]);
  assert.equal(formAdapter.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.JSON_XHR_API), false);

  const unknownAdapter = analyzeOperationalCrawlerSource({
    source: { sourceId: "unknown_adapter", adapter: "mystery" },
    executionResult: { result_status: "success", observed_count: 1 },
    notices: [{ content: "Long enough content supplied by a source.", detailIdentity: { verified: true } }],
    matchedCount: 1,
  });
  assert.equal(unknownAdapter.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.JSON_XHR_API), false);
  assert.equal(unknownAdapter.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.FORM_POST_REDIRECT), false);
});

test("runtime evidence maps to profiles without rewriting transport evidence", () => {
  const tlsResult = {
    result_status: "network_error",
    observed_count: 0,
    final_transport_error_code: "CERT_HAS_EXPIRED",
    final_transport_error_category: "tls_certificate",
    final_transport_error_retryable: false,
    attempt_history: [{ transport_error_code: "CERT_HAS_EXPIRED" }],
  };
  const before = structuredClone(tlsResult);
  const tls = analyzeOperationalCrawlerSource({ source: { sourceId: "tls" }, executionResult: tlsResult });
  assert.equal(tls.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.TLS_OR_CERTIFICATE_EXCEPTION), true);
  assert.deepEqual(tlsResult, before);
  assert.equal("attempt_history" in tls, false);
  const auth = analyzeOperationalCrawlerSource({ source: { sourceId: "auth" }, executionResult: { result_status: "http_error", http_status: 403 } });
  const rateLimit = analyzeOperationalCrawlerSource({ source: { sourceId: "rate" }, executionResult: { result_status: "http_error", http_status: 429 } });
  assert.equal(auth.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.AUTH_OR_CAPTCHA_REQUIRED), true);
  assert.equal(rateLimit.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.BOT_BLOCKED_OR_RATE_LIMITED), true);
});

test("multiple operational codes are retained with deterministic primary priority", () => {
  const row = analyzeOperationalCrawlerSource({
    source: { sourceId: "multiple_codes" },
    executionResult: {
      result_status: "partial",
      observed_count: 1,
      parser_evidence: {
        list_candidate_count: 1,
        valid_detail_url_count: 1,
        pagination_evidence_count: 1,
        pagination_verified: false,
      },
    },
    notices: [{ detailResultStatus: "network_error", content: "" }],
    matchedCount: 0,
  });
  assert.equal(row.primary_failure_code, "DETAIL_FETCH_FAILED");
  assert.equal(row.operational_codes.includes("DETAIL_FETCH_FAILED"), true);
  assert.equal(row.operational_codes.includes("PAGINATION_UNVERIFIED"), true);
});

test("contamination leaks and rate nullability are explicit", () => {
  const contaminated = analyzeOperationalCrawlerSource({
    source: { sourceId: "contaminated" },
    executionResult: {
      result_status: "success",
      observed_count: 1,
      parser_evidence: {
        parser_strategy: "heuristic_anchor",
        list_candidate_count: 1,
        title_extract_count: 1,
        date_extract_count: 0,
        valid_detail_url_count: 1,
        contaminated_candidate_count: 3,
        contaminated_candidate_leak_count: 1,
      },
    },
    notices: [{ content: "Long detail content for contamination verification.", detailIdentity: { verified: true } }],
    matchedCount: 1,
  });
  assert.equal(contaminated.operational_codes.includes("LIST_SELECTOR_MENU_CONTAMINATION"), true);
  assert.equal(contaminated.capability_status, "config_or_selector_fix");
  assert.equal(contaminated.metrics.title_extract_rate, 1);
  assert.equal(contaminated.metrics.date_extract_rate, 0);

  const unobserved = analyzeOperationalCrawlerSource({
    source: { sourceId: "unobserved_rates" },
    executionResult: { result_status: "network_error" },
  });
  assert.equal(unobserved.metrics.title_extract_rate, null);
  assert.equal(unobserved.metrics.date_extract_rate, null);
  assert.equal(unobserved.metrics.detail_url_resolution_rate, null);
});

async function asyncTest(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await asyncTest("multi-page evidence aggregates and operational analysis adds no fetches", async () => {
  const source = {
    sourceId: "multi_page",
    sourceName: "Multi page",
    listUrl: "https://example.test/notices?page=1",
    baseUrl: "https://example.test",
  };
  const pages = new Map([
    ["https://example.test/notices?page=1", "<ul class='board-list-wrap'><li><a href='/notice?articleNo=1'>First</a><span class='date'>2026-07-21</span></li></ul><div class='pagination'><a href='?page=2'>2</a></div>"],
    ["https://example.test/notices?page=2", "<ul class='board-list-wrap'><li><a href='/notice?articleNo=2'>Second</a><span class='date'>2026-07-20</span></li></ul><div class='pagination'><a href='?page=1'>1</a></div>"],
  ]);
  let fetchCount = 0;
  const result = await runCommonCrawlerSource({
    source,
    inventoryRows: [{ source_id: source.sourceId }],
    strategy: createGenericHtmlStrategy({ parseListHtml: extractFromList }),
    fetchHtml: async (url) => {
      fetchCount += 1;
      return pages.get(url);
    },
    listUrls: [...pages.keys()],
    maxItems: 10,
    fetchDetails: false,
  });
  assert.equal(fetchCount, 2);
  assert.equal(result.parser_evidence.page_count, 2);
  assert.equal(result.parser_evidence.list_candidate_count, 2);
  assert.equal(result.parser_evidence.title_extract_count, 2);
  assert.equal(result.parser_evidence.date_extract_count, 2);
  assert.equal(result.parser_evidence.valid_detail_url_count, 2);
  assert.equal(result.parser_evidence.pagination_verified, true);
  const runtimeBefore = structuredClone(result);
  buildOperationalCrawlDiagnostics({
    sources: [{ source, executionResult: result, notices: result.notices, matchedCount: 0 }],
  });
  assert.equal(fetchCount, 2);
  assert.deepEqual(result, runtimeBefore);
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
