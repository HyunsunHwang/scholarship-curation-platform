import assert from "node:assert/strict";
import { runCommonCrawlerSource } from "../lib/crawler-engine/common-runner.mjs";
import { createGenericHtmlStrategy } from "../lib/crawler-engine/generic-html-strategy.mjs";
import {
  OPERATIONAL_COMMON_LIST_SELECTORS,
  collectOperationalListParserEvidence,
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
        parser_evidence: { parser_strategy: "heuristic_anchor", list_candidate_count: 0, title_extract_count: 0, date_extract_count: 0, resolved_detail_url_count: 0, valid_detail_url_count: 0, explicit_empty_state_detected: true, empty_state_evidence: "no results" },
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

test("empty-state evidence is limited to list-area empty-state elements", () => {
  const explicit = collectOperationalListParserEvidence(
    { listUrl: "https://example.test/notices" },
    "<main><div class='board-empty'>No results</div></main>",
    [],
  );
  assert.equal(explicit.explicit_empty_state_detected, true);
  assert.equal(explicit.empty_state_evidence, "No results");

  const unrelated = collectOperationalListParserEvidence(
    { listUrl: "https://example.test/notices" },
    "<footer>No results</footer>",
    [],
  );
  assert.equal(unrelated.explicit_empty_state_detected, false);
  assert.equal(unrelated.empty_state_evidence, null);
});

test("rows without resolved detail URLs require a selector or configuration fix", () => {
  const row = analyzeOperationalCrawlerSource({
    source: { sourceId: "configured_rows_without_url" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      parser_evidence: {
        parser_strategy: "configured_selector",
        configured_list_selector: ".row",
        selector_match_count: 20,
        list_candidate_count: 0,
        resolved_detail_url_count: 0,
        valid_detail_url_count: 0,
      },
    },
    notices: [],
    matchedCount: 0,
  });
  const stages = Object.fromEntries(row.stage_entries.map((entry) => [entry.stage, entry.status]));
  assert.equal(row.operational_codes.includes("URL_RESOLUTION_FAILED"), true);
  assert.equal(row.operational_codes.includes("ZERO_RECENT_NOTICES"), false);
  assert.equal(row.capability_status, "config_or_selector_fix");
  assert.equal(stages.notice_url_resolution, "failed");
});

test("common selector rows without candidates are not treated as zero notices", () => {
  const row = analyzeOperationalCrawlerSource({
    source: { sourceId: "common_rows_without_url" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      parser_evidence: {
        parser_strategy: "common_board_selector",
        matched_list_selector: ".board-list-wrap > li",
        selector_match_count: 8,
        list_candidate_count: 0,
        resolved_detail_url_count: 0,
        valid_detail_url_count: 0,
      },
    },
    notices: [],
    matchedCount: 0,
  });
  assert.equal(row.operational_codes.includes("URL_RESOLUTION_FAILED"), true);
  assert.equal(row.operational_codes.includes("ZERO_RECENT_NOTICES"), false);
  assert.equal(row.capability_status, "config_or_selector_fix");
});

test("placeholder event links remain manual browser network work, not zero notices", () => {
  const row = analyzeOperationalCrawlerSource({
    source: { sourceId: "placeholder_event_links" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      parser_evidence: {
        selector_match_count: 3,
        list_candidate_count: 0,
        resolved_detail_url_count: 0,
        valid_detail_url_count: 0,
        manual_network_evidence_required_count: 3,
      },
    },
    notices: [],
    matchedCount: 0,
  });
  assert.equal(row.operational_codes.includes("MANUAL_BROWSER_NETWORK_REQUIRED"), true);
  assert.equal(row.operational_codes.includes("ZERO_RECENT_NOTICES"), false);
  assert.equal(row.capability_status, "manual_review_required");
});

test("unimplemented client profiles require an adapter instead of reporting zero notices", () => {
  const row = analyzeOperationalCrawlerSource({
    source: { sourceId: "client_profile" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      parser_evidence: { list_candidate_count: 0, client_rendered_marker_detected: true },
    },
    notices: [],
    matchedCount: 0,
  });
  assert.equal(row.operational_codes.includes("ADAPTER_REQUIRED"), true);
  assert.equal(row.operational_codes.includes("ZERO_RECENT_NOTICES"), false);
  assert.equal(row.capability_status, "adapter_required");
});

test("only explicit and authoritative empty evidence produces no-posts status", () => {
  const explicit = analyzeOperationalCrawlerSource({
    source: { sourceId: "explicit_empty" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      parser_evidence: {
        selector_match_count: 0,
        list_candidate_count: 0,
        explicit_empty_state_detected: true,
        empty_state_evidence: "No posts",
      },
    },
    notices: [],
    filterMetrics: { parsed_date_count: 0, keyword_match_count: 0, date_match_count: 0 },
    matchedCount: 0,
  });
  const explicitStages = Object.fromEntries(explicit.stage_entries.map((entry) => [entry.stage, entry.status]));
  assert.equal(explicit.capability_status, "no_posts_detected");
  assert.equal(explicit.operational_codes.includes("ZERO_RECENT_NOTICES"), true);
  assert.equal(explicitStages.notice_url_resolution, "skipped");
  assert.equal(explicitStages.detail_fetch, "skipped");
  assert.equal(explicitStages.detail_content_extract, "skipped");
  assert.equal(explicitStages.candidate_filter, "success");
  assert.equal(explicitStages.final_result, "success");

  const adapter = analyzeOperationalCrawlerSource({
    source: { sourceId: "authoritative_empty_adapter", adapter: "fixture" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      adapter_evidence: {
        adapter_capability_verified: true,
        adapter_provides_authoritative_detail: true,
        adapter_access_profile: "JSON_XHR_API",
      },
    },
    notices: [],
    matchedCount: 0,
  });
  assert.equal(adapter.capability_status, "no_posts_detected");

  const insufficient = analyzeOperationalCrawlerSource({
    source: { sourceId: "unproven_empty" },
    executionResult: { result_status: "empty_observed", observed_count: 0 },
    notices: [],
    matchedCount: 0,
  });
  const insufficientStages = Object.fromEntries(insufficient.stage_entries.map((entry) => [entry.stage, entry.status]));
  assert.equal(insufficient.operational_codes.includes("UNKNOWN_NEEDS_MANUAL_REVIEW"), true);
  assert.equal(insufficient.operational_codes.includes("ZERO_RECENT_NOTICES"), false);
  assert.equal(insufficient.capability_status, "manual_review_required");
  assert.equal(insufficientStages.final_result, "manual_review_required");
});

test("configured empty-state evidence outranks zero selector matches only after a successful list fetch", () => {
  const normalEmpty = analyzeOperationalCrawlerSource({
    source: { sourceId: "configured_explicit_empty" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      parser_evidence: {
        configured_list_selector: ".notice-row",
        selector_match_count: 0,
        list_candidate_count: 0,
        resolved_detail_url_count: 0,
        valid_detail_url_count: 0,
        explicit_empty_state_detected: true,
        empty_state_evidence: "No posts",
      },
    },
    notices: [],
    filterMetrics: { parsed_date_count: 0, keyword_match_count: 0, date_match_count: 0 },
    matchedCount: 0,
  });
  const normalStages = Object.fromEntries(normalEmpty.stage_entries.map((entry) => [entry.stage, entry.status]));
  assert.equal(normalEmpty.operational_codes.includes("ZERO_RECENT_NOTICES"), true);
  assert.equal(normalEmpty.operational_codes.includes("LIST_SELECTOR_ZERO_MATCHES"), false);
  assert.equal(normalEmpty.operational_codes.includes("CONFIG_OR_SELECTOR_MISMATCH"), false);
  assert.equal(normalEmpty.operational_codes.includes("URL_RESOLUTION_FAILED"), false);
  assert.equal(normalEmpty.capability_status, "no_posts_detected");
  assert.equal(normalEmpty.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.SOURCE_CONFIG_OR_SELECTOR_MISMATCH), false);
  assert.equal(normalEmpty.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.UNKNOWN_NEEDS_MANUAL_REVIEW), false);
  assert.deepEqual(normalEmpty.access_profiles, []);
  assert.equal(normalStages.list_parse, "success");
  assert.equal(normalStages.notice_url_resolution, "skipped");
  assert.equal(normalStages.final_result, "success");

  const missingEmptyState = analyzeOperationalCrawlerSource({
    source: { sourceId: "configured_selector_missing" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      parser_evidence: {
        configured_list_selector: ".notice-row",
        selector_match_count: 0,
        list_candidate_count: 0,
        explicit_empty_state_detected: false,
      },
    },
    notices: [],
    matchedCount: 0,
  });
  const missingStages = Object.fromEntries(missingEmptyState.stage_entries.map((entry) => [entry.stage, entry.status]));
  assert.equal(missingEmptyState.operational_codes.includes("LIST_SELECTOR_ZERO_MATCHES"), true);
  assert.equal(missingEmptyState.operational_codes.includes("CONFIG_OR_SELECTOR_MISMATCH"), true);
  assert.equal(missingEmptyState.operational_codes.includes("ZERO_RECENT_NOTICES"), false);
  assert.equal(missingEmptyState.capability_status, "config_or_selector_fix");
  assert.equal(missingEmptyState.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.SOURCE_CONFIG_OR_SELECTOR_MISMATCH), true);
  assert.equal(missingStages.list_parse, "failed");

  const failedFetch = analyzeOperationalCrawlerSource({
    source: { sourceId: "network_error_with_stale_empty_state" },
    executionResult: {
      result_status: "network_error",
      observed_count: 0,
      parser_evidence: {
        configured_list_selector: ".notice-row",
        selector_match_count: 0,
        list_candidate_count: 0,
        explicit_empty_state_detected: true,
      },
    },
    notices: [],
    matchedCount: 0,
  });
  const failedStages = Object.fromEntries(failedFetch.stage_entries.map((entry) => [entry.stage, entry.status]));
  assert.equal(failedFetch.operational_codes.includes("ZERO_RECENT_NOTICES"), false);
  assert.equal(failedFetch.capability_status, "manual_review_required");
  assert.equal(failedFetch.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.SOURCE_CONFIG_OR_SELECTOR_MISMATCH), false);
  assert.equal(failedFetch.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.UNKNOWN_NEEDS_MANUAL_REVIEW), true);
  assert.equal(failedStages.list_fetch, "failed");
  assert.equal(failedStages.final_result, "manual_review_required");

  const paginatedEmpty = analyzeOperationalCrawlerSource({
    source: { sourceId: "paginated_explicit_empty" },
    executionResult: {
      result_status: "empty_observed",
      observed_count: 0,
      parser_evidence: {
        list_candidate_count: 0,
        explicit_empty_state_detected: true,
        pagination_evidence_count: 1,
        pagination_verified: false,
      },
    },
    notices: [],
    matchedCount: 0,
  });
  assert.equal(paginatedEmpty.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.SERVER_RENDERED_WITH_PAGINATION), true);
  assert.equal(paginatedEmpty.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.SOURCE_CONFIG_OR_SELECTOR_MISMATCH), false);
  assert.equal(paginatedEmpty.access_profiles.includes(OPERATIONAL_ACCESS_PROFILES.UNKNOWN_NEEDS_MANUAL_REVIEW), false);
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

test("non-candidate diagnostic detail probe makes unreachable details observable", () => {
  const row = analyzeOperationalCrawlerSource({
    source: { sourceId: "diagnostic_detail_probe" },
    executionResult: {
      result_status: "partial",
      observed_count: 8,
      diagnostic_detail_probe: {
        status: "failed",
        detail_result_status: "http_error",
        error: "HTTP 403",
        detail_content_extracted: false,
        detail_content_char_count: 0,
      },
    },
    notices: [],
    filterMetrics: {
      observed_count: 8,
      keyword_match_count: 0,
      date_match_count: 0,
    },
    matchedCount: 0,
  });
  assert.equal(row.capability_status, "list_supported_detail_failed");
  assert.equal(row.metrics.diagnostic_detail_probe_attempted_count, 1);
  assert.equal(row.metrics.diagnostic_detail_probe_failure_count, 1);
  assert.equal(row.metrics.detail_fetch_failure_count, 1);
  assert.equal(row.operational_codes.includes("DETAIL_FETCH_FAILED"), true);
});

test("inline multi-notice topology keeps Drive and form links out of the detail model", () => {
  const source = {
    sourceId: "inline_fixture",
    listUrl: "https://example.test/notices",
    baseUrl: "https://example.test",
    contentMode: "inline_sections",
    detailFetchRequired: false,
    detailContentAlreadyAvailable: true,
  };
  const html = `
    <h2>Scholarship application</h2><p>${"Detailed scholarship eligibility and application period. ".repeat(4)}</p><a href="https://drive.google.com/file/d/1">Attachment</a>
    <h2>Scholarship interview</h2><p>${"Detailed scholarship interview schedule and required documents. ".repeat(4)}</p><a href="https://forms.gle/example">Apply</a>
    <h2>Scholarship result</h2><p>${"Detailed scholarship result announcement and follow-up instructions. ".repeat(4)}</p><a href="https://drive.google.com/file/d/2">Result file</a>`;
  const evidence = collectOperationalListParserEvidence(source, html, []);
  assert.equal(extractFromList(source, html).length, 0);
  assert.equal(evidence.list_page_contains_candidate_body, true);
  assert.equal(evidence.inline_notice_section_count, 3);
  assert.equal(evidence.independent_detail_url_count, 0);
  assert.equal(evidence.attachment_link_count, 1);
  assert.equal(evidence.external_resource_link_count, 3);
  const row = analyzeOperationalCrawlerSource({
    source,
    executionResult: { result_status: "empty_observed", observed_count: 0, parser_evidence: evidence },
    notices: [],
    filterMetrics: { observed_count: 0, keyword_match_count: 0, date_match_count: 0 },
  });
  assert.equal(row.content_topology_profiles.includes("INLINE_MULTI_NOTICE_PAGE"), true);
  assert.equal(row.capability_status, "adapter_required");
  assert.equal(row.primary_failure_code, "ADAPTER_REQUIRED");
  assert.equal(row.recommended_action, "implement_inline_section_adapter");
});

test("navigation links do not contribute inline notice evidence", () => {
  const evidence = collectOperationalListParserEvidence(
    { sourceId: "navigation_fixture", listUrl: "https://example.test/notices", baseUrl: "https://example.test" },
    `<header><h2>Scholarship navigation</h2><a href="/notice?articleNo=99">Notice menu</a></header>
      <h2>Only heading</h2><p>Short text.</p><footer><a href="/notice?articleNo=98">Footer notice</a></footer>`,
    [],
  );
  assert.equal(evidence.list_page_contains_candidate_body, false);
  assert.equal(evidence.same_origin_link_count, 0);
});

test("verified inline adapter makes the same topology supported", () => {
  const row = analyzeOperationalCrawlerSource({
    source: { sourceId: "inline_adapter", contentMode: "inline_sections" },
    executionResult: {
      result_status: "success",
      observed_count: 2,
      parser_evidence: { list_page_contains_candidate_body: true, inline_notice_section_count: 2, independent_detail_url_count: 0 },
      adapter_evidence: { adapter_capability_verified: true, adapter_provides_authoritative_detail: true },
    },
    notices: [{ content: "authoritative inline body" }, { content: "another authoritative inline body" }],
    matchedCount: 1,
  });
  assert.equal(row.capability_status, "supported");
});

test("ordinary detail 404 remains a detail failure", () => {
  const row = analyzeOperationalCrawlerSource({
    source: { sourceId: "ordinary_detail" },
    executionResult: { result_status: "partial", observed_count: 1, parser_evidence: { valid_detail_url_count: 1 } },
    notices: [{ detailResultStatus: "http_error", detailFetchError: "HTTP 404" }],
  });
  assert.equal(row.capability_status, "list_supported_detail_failed");
  assert.equal(row.content_topology_profiles.includes("LIST_DETAIL_PAGES"), true);
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
