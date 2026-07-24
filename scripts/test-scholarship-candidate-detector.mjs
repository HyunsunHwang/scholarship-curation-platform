import assert from "node:assert/strict";
import {
  DEFAULT_SCHOLARSHIP_KEYWORDS,
  detectScholarshipCandidate,
  parseScholarshipNoticeDate,
  summarizeScholarshipCandidateResults,
} from "../lib/detection/scholarship-candidate-detector.mjs";
import { buildDetailFetchPlan } from "../lib/crawler-engine/detail-fetch-planner.mjs";
import {
  buildPreliminaryScholarshipCandidatePlan,
  finalizeScholarshipCandidateDetection,
} from "../lib/crawler-engine/scholarship-candidate-pipeline.mjs";
import { runCommonCrawlerSource } from "../lib/crawler-engine/common-runner.mjs";
import { buildCandidateDetectionDiagnostics } from "../lib/crawler-engine/candidate-detection-diagnostics.mjs";
import { buildSourceRegistryDiagnostics } from "../lib/crawler-engine/source-registry-diagnostics.mjs";
import { buildCrawlerReport } from "../lib/crawler-engine/runtime-diagnostics/report-builder.mjs";
import { getAdapterCapabilityEvidence } from "../lib/crawler-adapters/index.mjs";
import {
  buildConditionalRequestHeaders,
  fetchUrlWithMetadata,
} from "./crawl-scholarship-notices.mjs";

const now = new Date("2026-07-23T00:00:00.000Z");
const detect = (observation, options = {}) => detectScholarshipCandidate(observation, {
  now,
  lookbackDays: 31,
  allowUndated: false,
  stage: "final",
  ...options,
});

assert.deepEqual(DEFAULT_SCHOLARSHIP_KEYWORDS, [
  "장학", "장학금", "학자금", "등록금", "scholarship", "tuition", "financial aid",
]);

assert.equal(detect({
  title: "2026학년도 장학금 선발 안내",
  dateText: "2026.07.20",
}).classification, "candidate");

const inlineDetailPlan = buildDetailFetchPlan({
  observations: [{ noticeUrl: "https://drive.google.com/file/d/fixture", title: "External resource" }],
  candidateResults: [{ classification: "candidate", reasonCodes: ["TITLE_KEYWORD"] }],
  diagnosticDetailProbeEnabled: false,
  detailFetchRequired: false,
});
assert.equal(inlineDetailPlan.diagnosticDetailProbe, null);
assert.equal(inlineDetailPlan.fetch.length, 0);
assert.equal(inlineDetailPlan.skip[0].skipReason, "source_detail_fetch_not_required");
assert.equal(detect({
  title: "도서관 운영 안내",
  dateText: "2026.07.20",
}).classification, "not_candidate");
assert.equal(detect({
  title: "Scholarship Application",
  dateText: "July 20, 2026",
}).classification, "candidate");
assert.equal(detect({
  title: "2025학년도 장학금 선발 안내",
  dateText: "2025.07.20",
}).classification, "out_of_range");
assert.equal(detect({
  title: "장학금 선발 안내",
}, { allowUndated: true }).classification, "candidate");

const preliminaryUndated = detectScholarshipCandidate({
  title: "장학금 선발 안내",
}, {
  now,
  lookbackDays: 31,
  allowUndated: false,
  stage: "preliminary",
});
assert.equal(preliminaryUndated.classification, "undetermined");
assert.equal(preliminaryUndated.eligibleForDetailFetch, true);
assert.equal(preliminaryUndated.eligibleForDownstream, false);

const missingTitle = detect({
  title: "",
  content: "장학금 신청 안내",
  dateText: "2026.07.20",
});
assert.equal(missingTitle.classification, "undetermined");
assert.equal(missingTitle.eligibleForDetailFetch, true);

const footerOnly = detect({
  title: "학사 일정 안내",
  content: "사이트 공통 footer 장학금 메뉴",
  dateText: "2026.07.20",
});
assert.equal(footerOnly.classification, "not_candidate");
assert.deepEqual(footerOnly.keywordResult.matchedLocations, ["body"]);
assert.equal(footerOnly.keywordResult.matched, false);

assert.equal(detect({
  title: "Research Grant Application",
  dateText: "2026.07.20",
}, { keywords: ["grant"] }).classification, "candidate");
assert.equal(detect({
  title: "Scholarship Application",
  dateText: "2026.07.20",
}, { keywords: ["grant"] }).classification, "not_candidate");

for (const raw of [
  "2026.07.20",
  "2026-07-20",
  "2026/07/20",
  "2026년 7월 20일",
  "26.07.20",
  "July 20, 2026",
  "20 Jul 2026",
]) {
  assert.equal(parseScholarshipNoticeDate(raw)?.toISOString().slice(0, 10), "2026-07-20", raw);
}
assert.equal(parseScholarshipNoticeDate("2026.02.30"), null);

const observations = Array.from({ length: 100 }, (_, index) => ({
  observationId: `observation-${index}`,
  noticeUrl: `https://example.edu/${index}`,
}));
const candidateResults = observations.map((observation, index) => ({
  observationId: observation.observationId,
  classification: index < 3
    ? "candidate"
    : index < 5
      ? "undetermined"
      : index < 95
        ? "not_candidate"
        : "out_of_range",
  eligibleForDetailFetch: index < 5,
  reasonCodes: [`fixture_${index}`],
}));
const plan = buildDetailFetchPlan({ observations, candidateResults });
assert.equal(plan.fetch.length, 5);
assert.equal(plan.skip.length, 95);
assert.equal(
  buildDetailFetchPlan({
    observations: [observations[0]],
    candidateResults: [candidateResults[0]],
    seenNoticeUrls: [observations[0].noticeUrl],
  }).fetch.length,
  1,
  "seen URLs must remain eligible unless a revision policy explicitly skips them",
);
assert.equal(
  buildDetailFetchPlan({
    observations: [observations[0]],
    candidateResults: [candidateResults[0]],
    seenNoticeUrls: [observations[0].noticeUrl],
    shouldRefetchSeen: () => false,
  }).skip[0].skipReason,
  "existing_notice_refetch_not_required",
);

const adapterObservations = [{
  sourceId: "adapter_source",
  noticeUrl: "https://example.edu/api/1",
  title: "장학금 안내",
  dateText: "2026.07.20",
  content: "authoritative adapter content",
}];
const adapterPreliminary = buildPreliminaryScholarshipCandidatePlan(adapterObservations, {
  detector: detectScholarshipCandidate,
  planner: buildDetailFetchPlan,
  detectorOptions: { now, lookbackDays: 31, allowUndated: false },
});
const adapterDetection = finalizeScholarshipCandidateDetection({
  listObservations: adapterObservations,
  preliminaryCandidateResults: adapterPreliminary.preliminaryCandidateResults,
  detailFetchPlan: adapterPreliminary.detailFetchPlan,
  detailObservations: adapterPreliminary.detailFetchPlan.fetch,
  detector: detectScholarshipCandidate,
  detectorOptions: { now, lookbackDays: 31, allowUndated: false },
  detailFetchRequired: false,
});
assert.equal(adapterDetection.detail_fetch_planned_count, 1);
assert.equal(adapterDetection.detail_fetch_completed_count, 1);
assert.equal(adapterDetection.requests_avoided_by_preliminary_filter, 0);

const summary = summarizeScholarshipCandidateResults(candidateResults);
assert.deepEqual(summary, {
  candidate_count: 3,
  not_candidate_count: 90,
  out_of_range_count: 5,
  undetermined_count: 2,
  detection_error_count: 0,
});

const parityFixture = [
  { noticeUrl: "https://example.edu/1", title: "2026 장학금 안내", dateText: "2026.07.21" },
  { noticeUrl: "https://example.edu/2", title: "도서관 안내", dateText: "2026.07.21" },
  { noticeUrl: "https://example.edu/3", title: "Scholarship Application", dateText: "2026-07-01" },
  { noticeUrl: "https://example.edu/4", title: "등록금 지원 안내", dateText: "2025.01.01" },
  { noticeUrl: "https://example.edu/5", title: "학자금 신청", dateText: "" },
];
const legacyUrls = parityFixture.filter((item) => {
  const keywordMatched = DEFAULT_SCHOLARSHIP_KEYWORDS.some((keyword) =>
    item.title.toLowerCase().includes(keyword.toLowerCase()));
  if (!keywordMatched) return false;
  const parsed = parseScholarshipNoticeDate(item.dateText)
    ?? parseScholarshipNoticeDate(item.title);
  if (!parsed) return false;
  const minimum = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  return parsed >= minimum && parsed <= now;
}).map((item) => item.noticeUrl);
const detectorUrls = parityFixture.filter((item) =>
  detect(item).eligibleForDownstream).map((item) => item.noticeUrl);
assert.deepEqual(detectorUrls, legacyUrls);

let listRequestCount = 0;
let detailRequestCount = 0;
const integrationItems = Array.from({ length: 100 }, (_, index) => ({
  sourceId: "fixture_source",
  sourceName: "Fixture",
  listUrl: "https://example.edu/notices",
  noticeUrl: `https://example.edu/notices/${index}`,
  title: index < 5
    ? `장학금 안내 ${index}`
    : index < 95
      ? `일반 공지 ${index}`
      : `지난 장학금 안내 ${index}`,
  dateText: index < 3
    ? "2026.07.20"
    : index < 5
      ? ""
      : index < 95
        ? "2026.07.20"
        : "2025.01.01",
}));
const integrationResult = await runCommonCrawlerSource({
  source: {
    sourceId: "fixture_source",
    sourceName: "Fixture",
    listUrl: "https://example.edu/notices",
  },
  inventoryRows: [{ source_id: "fixture_source" }],
  strategy: {
    name: "fixture",
    buildListRequest: ({ listUrl }) => ({ url: listUrl, kind: "list" }),
    parseList: () => integrationItems,
    resolveDetailUrl: ({ item }) => item.noticeUrl,
    buildDetailRequest: ({ item }) => ({ url: item.noticeUrl, kind: "detail" }),
    parseDetail: ({ item }) => ({
      detailDate: item.dateText || "2026.07.20",
      detailTitle: item.title,
      content: "",
    }),
    normalizeNotice: ({ item, detail }) => ({ ...item, ...detail }),
  },
  fetchHtml: async (_url, request) => {
    if (request.kind === "list") listRequestCount += 1;
    if (request.kind === "detail") detailRequestCount += 1;
    return "<html></html>";
  },
  maxItems: 100,
  fetchDetails: true,
  detailConcurrency: 2,
  candidateDetector: detectScholarshipCandidate,
  detailFetchPlanner: buildDetailFetchPlan,
  candidateDetectionOptions: {
    keywords: DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays: 31,
    allowUndated: false,
    now,
  },
});
assert.equal(listRequestCount, 1);
assert.equal(detailRequestCount, 5);
assert.equal(integrationResult.candidate_detection.observed_list_item_count, 100);
assert.equal(integrationResult.candidate_detection.detail_fetch_planned_count, 5);
assert.equal(integrationResult.candidate_detection.detail_fetch_skipped_count, 95);
assert.equal(integrationResult.candidate_detection.requests_avoided_by_preliminary_filter, 95);
assert.equal(integrationResult.candidate_detection.final_summary.candidate_count, 5);
assert.equal(
  Object.entries(integrationResult.candidate_detection.preliminary_summary)
    .filter(([key]) => key.endsWith("_count") && key !== "detection_error_count")
    .reduce((total, [, value]) => total + value, 0),
  integrationResult.candidate_detection.observed_list_item_count,
);
assert.equal(
  integrationResult.candidate_detection.detail_fetch_planned_count
    + integrationResult.candidate_detection.detail_fetch_skipped_count,
  integrationResult.candidate_detection.observed_list_item_count,
);
assert.equal(
  Object.entries(integrationResult.candidate_detection.final_summary)
    .filter(([key]) => key.endsWith("_count") && key !== "detection_error_count")
    .reduce((total, [, value]) => total + value, 0),
  integrationResult.candidate_detection.detail_fetch_completed_count,
);

let diagnosticProbeRequestCount = 0;
const noCandidateItems = [
  {
    sourceId: "probe_source",
    sourceName: "Probe source",
    noticeUrl: "https://example.edu/probe/first",
    title: "일반 공지",
    dateText: "2026.07.20",
  },
  {
    sourceId: "probe_source",
    sourceName: "Probe source",
    noticeUrl: "https://example.edu/probe/last",
    title: "행사 안내",
    dateText: "2026.07.20",
  },
];
const diagnosticProbeResult = await runCommonCrawlerSource({
  source: { sourceId: "probe_source", sourceName: "Probe source", listUrl: "https://example.edu/probe" },
  inventoryRows: [{ source_id: "probe_source" }],
  strategy: {
    name: "probe-fixture",
    buildListRequest: ({ listUrl }) => ({ url: listUrl, kind: "list" }),
    parseList: () => noCandidateItems,
    resolveDetailUrl: ({ item }) => item.noticeUrl,
    buildDetailRequest: ({ item }) => ({ url: item.noticeUrl, kind: "detail" }),
    parseDetail: () => ({ content: "A readable non-scholarship detail body for diagnostics." }),
    normalizeNotice: ({ item, detail }) => ({ ...item, ...detail }),
  },
  fetchHtml: async (_url, request) => {
    if (request.kind === "detail") diagnosticProbeRequestCount += 1;
    return "<html></html>";
  },
  fetchDetails: true,
  candidateDetector: detectScholarshipCandidate,
  detailFetchPlanner: buildDetailFetchPlan,
  candidateDetectionOptions: {
    keywords: DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays: 31,
    allowUndated: false,
    now,
  },
});
assert.equal(diagnosticProbeRequestCount, 1);
assert.equal(diagnosticProbeResult.notices.length, 0);
assert.equal(diagnosticProbeResult.result_status, "success");
assert.equal(diagnosticProbeResult.candidate_detection.diagnostic_detail_probe_planned_count, 1);
assert.equal(diagnosticProbeResult.candidate_detection.requests_avoided_by_preliminary_filter, 1);
assert.deepEqual(diagnosticProbeResult.diagnostic_detail_probe, {
  observation_key: "https://example.edu/probe/last",
  selection_reason: "last_non_candidate_list_observation",
  notice_url: "https://example.edu/probe/last",
  status: "success",
  detail_result_status: null,
  detail_transport_error_code: null,
  detail_transport_error_category: null,
  detail_transport_error_retryable: null,
  detail_content_extracted: true,
  detail_content_char_count: 55,
  error: null,
});

const failedDiagnosticProbeResult = await runCommonCrawlerSource({
  source: { sourceId: "probe_failure", sourceName: "Probe failure", listUrl: "https://example.edu/probe-failure" },
  inventoryRows: [{ source_id: "probe_failure" }],
  strategy: {
    name: "probe-failure-fixture",
    buildListRequest: ({ listUrl }) => ({ url: listUrl, kind: "list" }),
    parseList: () => noCandidateItems.map((item) => ({ ...item, noticeUrl: item.noticeUrl.replace("/probe/", "/probe-failure/") })),
    resolveDetailUrl: ({ item }) => item.noticeUrl,
    buildDetailRequest: ({ item }) => ({ url: item.noticeUrl, kind: "detail" }),
    normalizeNotice: ({ item, detail }) => ({ ...item, ...detail }),
  },
  fetchHtml: async (_url, request) => {
    if (request.kind === "detail") throw Object.assign(new Error("HTTP 404"), { httpStatus: 404 });
    return "<html></html>";
  },
  fetchDetails: true,
  candidateDetector: detectScholarshipCandidate,
  detailFetchPlanner: buildDetailFetchPlan,
  candidateDetectionOptions: {
    keywords: DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays: 31,
    allowUndated: false,
    now,
  },
});
assert.equal(failedDiagnosticProbeResult.result_status, "success");
assert.equal(failedDiagnosticProbeResult.notices.length, 0);
assert.equal(failedDiagnosticProbeResult.item_summary.failed_count, 0);
assert.equal(failedDiagnosticProbeResult.item_summary.successful_count, 0);
assert.equal(failedDiagnosticProbeResult.item_summary.diagnostic_detail_probe_attempted, 1);
assert.equal(failedDiagnosticProbeResult.item_summary.diagnostic_detail_probe_failed_count, 1);
assert.equal(failedDiagnosticProbeResult.diagnostic_detail_probe.status, "failed");
assert.equal(failedDiagnosticProbeResult.diagnostic_detail_probe.detail_result_status, "http_error");

const tlsDiagnosticProbeResult = await runCommonCrawlerSource({
  source: { sourceId: "probe_tls", sourceName: "Probe TLS", listUrl: "https://example.edu/probe-tls" },
  inventoryRows: [{ source_id: "probe_tls" }],
  strategy: {
    name: "probe-tls-fixture",
    buildListRequest: ({ listUrl }) => ({ url: listUrl, kind: "list" }),
    parseList: () => noCandidateItems.map((item) => ({ ...item, noticeUrl: item.noticeUrl.replace("/probe/", "/probe-tls/") })),
    resolveDetailUrl: ({ item }) => item.noticeUrl,
    buildDetailRequest: ({ item }) => ({ url: item.noticeUrl, kind: "detail" }),
    normalizeNotice: ({ item, detail }) => ({ ...item, ...detail }),
  },
  fetchHtml: async (_url, request) => {
    if (request.kind === "detail") {
      throw Object.assign(new Error("fetch failed"), {
        cause: Object.assign(new Error("unable to verify the first certificate"), {
          code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        }),
      });
    }
    return "<html></html>";
  },
  fetchDetails: true,
  candidateDetector: detectScholarshipCandidate,
  detailFetchPlanner: buildDetailFetchPlan,
  candidateDetectionOptions: {
    keywords: DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays: 31,
    allowUndated: false,
    now,
  },
});
assert.equal(tlsDiagnosticProbeResult.result_status, "success");
assert.equal(tlsDiagnosticProbeResult.item_summary.failed_count, 0);
assert.equal(tlsDiagnosticProbeResult.item_summary.diagnostic_detail_probe_failed_count, 1);
assert.equal(tlsDiagnosticProbeResult.diagnostic_detail_probe.detail_transport_error_code, "UNABLE_TO_VERIFY_LEAF_SIGNATURE");
assert.equal(tlsDiagnosticProbeResult.diagnostic_detail_probe.detail_transport_error_category, "tls_certificate");
assert.equal(tlsDiagnosticProbeResult.diagnostic_detail_probe.detail_transport_error_retryable, false);

const failedCandidateDetailResult = await runCommonCrawlerSource({
  source: { sourceId: "candidate_failure", sourceName: "Candidate failure", listUrl: "https://example.edu/candidate-failure" },
  inventoryRows: [{ source_id: "candidate_failure" }],
  strategy: {
    name: "candidate-failure-fixture",
    buildListRequest: ({ listUrl }) => ({ url: listUrl, kind: "list" }),
    parseList: () => [{
      sourceId: "candidate_failure",
      sourceName: "Candidate failure",
      noticeUrl: "https://example.edu/candidate-failure/1",
      title: "Scholarship application",
      dateText: "2026.07.20",
    }],
    resolveDetailUrl: ({ item }) => item.noticeUrl,
    buildDetailRequest: ({ item }) => ({ url: item.noticeUrl, kind: "detail" }),
    normalizeNotice: ({ item, detail }) => ({ ...item, ...detail }),
  },
  fetchHtml: async (_url, request) => {
    if (request.kind === "detail") throw Object.assign(new Error("HTTP 404"), { status: 404 });
    return "<html></html>";
  },
  fetchDetails: true,
  candidateDetector: detectScholarshipCandidate,
  detailFetchPlanner: buildDetailFetchPlan,
  candidateDetectionOptions: {
    keywords: DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays: 31,
    allowUndated: false,
    now,
  },
});
assert.equal(failedCandidateDetailResult.result_status, "partial");
assert.equal(failedCandidateDetailResult.item_summary.failed_count, 1);
assert.equal(failedCandidateDetailResult.item_summary.diagnostic_detail_probe_failed_count, 0);

const combinedCandidateAndProbeFailureResult = await runCommonCrawlerSource({
  source: { sourceId: "combined_failure", sourceName: "Combined failure", listUrl: "https://example.edu/combined-failure" },
  inventoryRows: [{ source_id: "combined_failure" }],
  strategy: {
    name: "combined-failure-fixture",
    buildListRequest: ({ listUrl }) => ({ url: listUrl, kind: "list" }),
    parseList: () => [{
      sourceId: "combined_failure",
      sourceName: "Combined failure",
      noticeUrl: "https://example.edu/combined-failure/candidate",
      title: "Scholarship application",
      dateText: "2026.07.20",
    }, {
      sourceId: "combined_failure",
      sourceName: "Combined failure",
      noticeUrl: "https://example.edu/combined-failure/probe",
      title: "General event",
      dateText: "2026.07.20",
    }],
    resolveDetailUrl: ({ item }) => item.noticeUrl,
    buildDetailRequest: ({ item }) => ({ url: item.noticeUrl, kind: "detail" }),
    normalizeNotice: ({ item, detail }) => ({ ...item, ...detail }),
  },
  fetchHtml: async (_url, request) => {
    if (request.kind === "detail") {
      throw Object.assign(new Error("HTTP 404"), { httpStatus: 404 });
    }
    return "<html></html>";
  },
  fetchDetails: true,
  candidateDetector: detectScholarshipCandidate,
  detailFetchPlanner: ({ observations, candidateResults }) => ({
    fetch: [observations[0]],
    skip: [{
      observation: observations[1],
      candidateResult: candidateResults[1],
      skipReason: "candidate_not_candidate",
      observationKey: observations[1].noticeUrl,
    }],
    diagnosticDetailProbe: {
      observation: observations[1],
      observationKey: observations[1].noticeUrl,
      selectionReason: "last_non_candidate_list_observation",
    },
    seenNoticeUrlCount: 0,
  }),
  candidateDetectionOptions: {
    keywords: DEFAULT_SCHOLARSHIP_KEYWORDS,
    lookbackDays: 31,
    allowUndated: false,
    now,
  },
});
assert.equal(combinedCandidateAndProbeFailureResult.result_status, "partial");
assert.equal(combinedCandidateAndProbeFailureResult.item_summary.failed_count, 1);
assert.equal(combinedCandidateAndProbeFailureResult.item_summary.diagnostic_detail_probe_failed_count, 1);
assert.equal(combinedCandidateAndProbeFailureResult.diagnostic_detail_probe.status, "failed");

const candidateDiagnostics = buildCandidateDetectionDiagnostics([
  {
    sourceId: "normal_zero",
    executionResult: {
      result_status: "success",
      item_summary: { failed_count: 0 },
      candidate_detection: {
        observed_list_item_count: 20,
        preliminary_summary: {
          candidate_count: 0, not_candidate_count: 20, out_of_range_count: 0,
          undetermined_count: 0, detection_error_count: 0,
        },
        detail_fetch_planned_count: 0,
        detail_fetch_completed_count: 0,
        detail_fetch_skipped_count: 20,
        requests_avoided_by_preliminary_filter: 20,
        final_summary: {
          candidate_count: 0, not_candidate_count: 0, out_of_range_count: 0,
          undetermined_count: 0, detection_error_count: 0,
        },
      },
    },
  },
  {
    sourceId: "parse_failed",
    executionResult: { result_status: "parser_error" },
  },
  {
    sourceId: "all_titles_missing",
    executionResult: {
      result_status: "success",
      item_summary: { failed_count: 0 },
      candidate_detection: {
        observed_list_item_count: 20,
        preliminary_summary: {
          candidate_count: 0, not_candidate_count: 0, out_of_range_count: 0,
          undetermined_count: 20, detection_error_count: 20,
        },
        detail_fetch_planned_count: 20,
        detail_fetch_completed_count: 20,
        detail_fetch_skipped_count: 0,
        requests_avoided_by_preliminary_filter: 0,
        final_summary: {
          candidate_count: 0, not_candidate_count: 0, out_of_range_count: 0,
          undetermined_count: 20, detection_error_count: 20,
        },
      },
    },
  },
  {
    sourceId: "list_fetch_failed",
    executionResult: { result_status: "network_error" },
  },
  {
    sourceId: "partial_candidate",
    executionResult: {
      result_status: "partial",
      item_summary: { failed_count: 1 },
      candidate_detection: {
        observed_list_item_count: 2,
        preliminary_summary: {
          candidate_count: 2, not_candidate_count: 0, out_of_range_count: 0,
          undetermined_count: 0, detection_error_count: 0,
        },
        detail_fetch_planned_count: 2,
        detail_fetch_completed_count: 2,
        detail_fetch_skipped_count: 0,
        requests_avoided_by_preliminary_filter: 0,
        final_summary: {
          candidate_count: 1, not_candidate_count: 0, out_of_range_count: 0,
          undetermined_count: 1, detection_error_count: 0,
        },
      },
    },
  },
]);
assert.equal(candidateDiagnostics.sources[0].status, "success_no_scholarship_candidate");
assert.equal(candidateDiagnostics.sources[1].status, "candidate_detection_blocked_by_parse_failure");
assert.equal(candidateDiagnostics.sources[2].status, "candidate_detection_blocked_by_parse_failure");
assert.equal(candidateDiagnostics.sources[3].status, "crawl_failed_before_candidate_detection");
assert.equal(candidateDiagnostics.sources[4].status, "partial_with_candidates");
assert.equal(candidateDiagnostics.summary.observed_list_item_count, 42);
assert.equal(candidateDiagnostics.summary.requests_avoided_by_preliminary_filter, 20);

const report = buildCrawlerReport({
  runAt: now.toISOString(),
  executionResults: [{
    source_id: "fixture_source",
    notices: [{ title: "must not leak" }],
    candidate_detection: {
      policy_version: "scholarship-candidate-policy-v1",
      observed_list_item_count: 1,
      preliminary_candidate_results: [{ observation: { content: "must not leak" } }],
      preliminary_summary: summary,
      detail_fetch_planned_count: 1,
      detail_fetch_completed_count: 1,
      detail_fetch_skipped_count: 0,
      requests_avoided_by_preliminary_filter: 0,
      skipped: [{ observation: { content: "must not leak" } }],
      final_candidate_results: [{ observation: { content: "must not leak" } }],
      final_summary: summary,
    },
  }],
  candidateDetection: candidateDiagnostics,
  sourceRegistryDiagnostics: { duplicate_list_url_count: 0 },
});
assert.equal(report.candidateDetection.summary.detail_fetch_skipped_count, 20);
assert.equal(report.sourceRegistryDiagnostics.duplicate_list_url_count, 0);
assert.equal(report.boundedExecution.sources[0].notices, undefined);
assert.equal(
  report.boundedExecution.sources[0].candidate_detection.preliminary_candidate_results,
  undefined,
);
assert.doesNotMatch(JSON.stringify(report.boundedExecution.sources), /must not leak/);

assert.deepEqual(buildConditionalRequestHeaders({
  etag: '"fixture-etag"',
  lastModified: "Wed, 22 Jul 2026 10:00:00 GMT",
}), {
  "if-none-match": '"fixture-etag"',
  "if-modified-since": "Wed, 22 Jul 2026 10:00:00 GMT",
});

const originalFetch = globalThis.fetch;
let conditionalHeaders = null;
try {
  globalThis.fetch = async (_url, options) => {
    conditionalHeaders = options.headers;
    return new Response(null, {
      status: 304,
      headers: {
        etag: '"fixture-etag"',
        "last-modified": "Wed, 22 Jul 2026 10:00:00 GMT",
      },
    });
  };
  const notModified = await fetchUrlWithMetadata("https://example.edu/notice/1", {
    headers: buildConditionalRequestHeaders({
      etag: '"fixture-etag"',
      lastModified: "Wed, 22 Jul 2026 10:00:00 GMT",
    }),
    retryCount: 0,
  });
  assert.equal(conditionalHeaders["if-none-match"], '"fixture-etag"');
  assert.equal(notModified.httpStatus, 304);
  assert.equal(notModified.notModified, true);
  assert.equal(notModified.contentLength, 0);
} finally {
  globalThis.fetch = originalFetch;
}

const registryDiagnostics = buildSourceRegistryDiagnostics([
  { sourceId: "a", listUrl: "https://example.edu/board/" },
  { sourceId: "b", listUrl: "https://example.edu/board" },
  { sourceId: "c", listUrl: "https://example.edu/board?category=scholarship" },
]);
assert.equal(registryDiagnostics.duplicate_list_url_count, 1);
assert.deepEqual(
  registryDiagnostics.duplicate_list_urls[0].sources.map((source) => source.source_id),
  ["a", "b"],
);
assert.equal(registryDiagnostics.automatic_deduplication_applied, false);

assert.deepEqual(
  getAdapterCapabilityEvidence("cau_portal"),
  {
    adapter_capability_verified: true,
    adapter_provides_authoritative_detail: true,
    detail_fetch_required: false,
    detail_content_already_available: true,
    adapter_access_profile: "JSON_XHR_API",
  },
);

console.log("scholarship candidate detector tests passed");
