import { isSuccessfulCrawlerResult, isZeroMatchCrawlerResult } from "./failure-analyzer.mjs";
import { verifyOperationalDetailTitleIdentity } from "./operational-title-identity.mjs";

export const OPERATIONAL_ACCESS_PROFILES = Object.freeze({
  STATIC_HTML_HREF: "STATIC_HTML_HREF",
  STATIC_HTML_EVENT_URL: "STATIC_HTML_EVENT_URL",
  FORM_POST_REDIRECT: "FORM_POST_REDIRECT",
  JSON_XHR_API: "JSON_XHR_API",
  SERVER_RENDERED_WITH_PAGINATION: "SERVER_RENDERED_WITH_PAGINATION",
  CLIENT_RENDERED_OR_JS_REQUIRED: "CLIENT_RENDERED_OR_JS_REQUIRED",
  LEGACY_CHARSET: "LEGACY_CHARSET",
  TLS_OR_CERTIFICATE_EXCEPTION: "TLS_OR_CERTIFICATE_EXCEPTION",
  BOT_BLOCKED_OR_RATE_LIMITED: "BOT_BLOCKED_OR_RATE_LIMITED",
  AUTH_OR_CAPTCHA_REQUIRED: "AUTH_OR_CAPTCHA_REQUIRED",
  DETAIL_PAGE_UNREACHABLE: "DETAIL_PAGE_UNREACHABLE",
  ATTACHMENT_ACCESS_UNVERIFIED: "ATTACHMENT_ACCESS_UNVERIFIED",
  SOURCE_CONFIG_OR_SELECTOR_MISMATCH: "SOURCE_CONFIG_OR_SELECTOR_MISMATCH",
  UNKNOWN_NEEDS_MANUAL_REVIEW: "UNKNOWN_NEEDS_MANUAL_REVIEW",
});

export const OPERATIONAL_CRAWL_CODES = Object.freeze({
  LIST_SELECTOR_ZERO_MATCHES: "LIST_SELECTOR_ZERO_MATCHES",
  LIST_SELECTOR_MENU_CONTAMINATION: "LIST_SELECTOR_MENU_CONTAMINATION",
  URL_RESOLUTION_FAILED: "URL_RESOLUTION_FAILED",
  DETAIL_URL_UNVERIFIED: "DETAIL_URL_UNVERIFIED",
  DETAIL_FETCH_FAILED: "DETAIL_FETCH_FAILED",
  DETAIL_CONTENT_EMPTY_OR_BOILERPLATE: "DETAIL_CONTENT_EMPTY_OR_BOILERPLATE",
  DETAIL_IDENTITY_UNVERIFIED: "DETAIL_IDENTITY_UNVERIFIED",
  ZERO_RECENT_NOTICES: "ZERO_RECENT_NOTICES",
  FILTERED_OUT_BY_DATE: "FILTERED_OUT_BY_DATE",
  FILTERED_OUT_BY_KEYWORD: "FILTERED_OUT_BY_KEYWORD",
  PAGINATION_UNVERIFIED: "PAGINATION_UNVERIFIED",
  ADAPTER_REQUIRED: "ADAPTER_REQUIRED",
  CONFIG_OR_SELECTOR_MISMATCH: "CONFIG_OR_SELECTOR_MISMATCH",
  MANUAL_BROWSER_NETWORK_REQUIRED: "MANUAL_BROWSER_NETWORK_REQUIRED",
  UNKNOWN_NEEDS_MANUAL_REVIEW: "UNKNOWN_NEEDS_MANUAL_REVIEW",
});

export const OPERATIONAL_CRAWL_STAGES = Object.freeze([
  "list_fetch",
  "list_decode",
  "list_parse",
  "notice_url_resolution",
  "pagination_check",
  "detail_fetch",
  "detail_content_extract",
  "candidate_filter",
  "final_result",
]);

export const OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS = Object.freeze([
  "source_id", "source_name", "university_slug", "source_level", "capability_status", "primary_failure_code",
  "recommended_action", "observed_count", "matched_count", "detail_identity_verified_count", "detail_identity_unverified_count",
  "detail_fetch_failure_count", "detail_content_empty_count", "access_profiles", "runtime_result_status",
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function positive(value) {
  return Math.max(0, Number(value) || 0);
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, source_count]) => ({ key, source_count }));
}

function sourceIdentity(source = {}, executionResult = {}) {
  return {
    source_id: source.sourceId ?? source.source_id ?? executionResult.source_id ?? executionResult.source_key ?? null,
    source_name: source.sourceName ?? source.source_name ?? executionResult.source_name ?? "",
    university_slug: source.universitySlug ?? source.university_slug ?? null,
    source_level: source.sourceLevel ?? source.source_level ?? null,
    adapter: source.adapter ?? source.adapterStrategy ?? executionResult.strategy ?? "",
  };
}

function noticeMetrics(notices) {
  const rows = Array.isArray(notices) ? notices : [];
  const detailFailures = rows.filter((notice) => clean(notice?.detailResultStatus));
  const identityRows = rows.map((notice) => ({
    notice,
    identity: notice?.detailIdentity ?? (Array.isArray(notice?.detailTitleCandidates)
      ? verifyOperationalDetailTitleIdentity(notice.title, notice.detailTitleCandidates)
      : null),
  })).filter((entry) => entry.identity);
  const contentRows = rows.filter((notice) => !clean(notice?.detailFetchError));
  return {
    detail_sample_count: rows.length,
    detail_fetch_failure_count: detailFailures.length,
    detail_fetch_success_count: Math.max(0, rows.length - detailFailures.length),
    detail_identity_verified_count: identityRows.filter((entry) => entry.identity.verified === true).length,
    detail_identity_unverified_count: identityRows.filter((entry) => entry.identity.verified === false).length,
    detail_identity_unavailable_count: Math.max(0, rows.length - identityRows.length),
    detail_content_empty_count: contentRows.filter((notice) => clean(notice?.content).length < 20).length,
  };
}

function inferProfiles({ source, result, parserEvidence, metrics }) {
  const profiles = new Set();
  const adapter = clean(source.adapter ?? source.adapterStrategy ?? result.strategy).toLowerCase();
  if (adapter && adapter !== "generic_html") profiles.add(OPERATIONAL_ACCESS_PROFILES.JSON_XHR_API);
  if (positive(parserEvidence?.valid_detail_url_count) > 0) profiles.add(OPERATIONAL_ACCESS_PROFILES.STATIC_HTML_HREF);
  if (positive(parserEvidence?.pagination_evidence_count) > 0) profiles.add(OPERATIONAL_ACCESS_PROFILES.SERVER_RENDERED_WITH_PAGINATION);
  if (positive(metrics.detail_fetch_failure_count) > 0) profiles.add(OPERATIONAL_ACCESS_PROFILES.DETAIL_PAGE_UNREACHABLE);
  if (result.transport_error_category === "tls_certificate" || result.final_transport_error_category === "tls_certificate") {
    profiles.add(OPERATIONAL_ACCESS_PROFILES.TLS_OR_CERTIFICATE_EXCEPTION);
  }
  if (result.result_status === "http_error" && [401, 403].includes(Number(result.http_status))) {
    profiles.add(OPERATIONAL_ACCESS_PROFILES.AUTH_OR_CAPTCHA_REQUIRED);
  }
  if (parserEvidence?.configured_list_selector && positive(parserEvidence.selector_match_count) === 0) {
    profiles.add(OPERATIONAL_ACCESS_PROFILES.SOURCE_CONFIG_OR_SELECTOR_MISMATCH);
  }
  if (profiles.size === 0) profiles.add(OPERATIONAL_ACCESS_PROFILES.UNKNOWN_NEEDS_MANUAL_REVIEW);
  return [...profiles].sort();
}

function primaryFailureCode({ result, parserEvidence, metrics, matchedCount, filterMetrics }) {
  if (result?.result_status && !isSuccessfulCrawlerResult(result) && !isZeroMatchCrawlerResult(result)) {
    return OPERATIONAL_CRAWL_CODES.UNKNOWN_NEEDS_MANUAL_REVIEW;
  }
  if (parserEvidence?.configured_list_selector && positive(parserEvidence.selector_match_count) === 0) {
    return OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_ZERO_MATCHES;
  }
  if (positive(parserEvidence?.parsed_candidate_count) > 0 && positive(parserEvidence?.valid_detail_url_count) === 0) {
    return OPERATIONAL_CRAWL_CODES.URL_RESOLUTION_FAILED;
  }
  if (positive(metrics.detail_fetch_failure_count) > 0) return OPERATIONAL_CRAWL_CODES.DETAIL_FETCH_FAILED;
  if (positive(metrics.detail_sample_count) > 0 && positive(metrics.detail_identity_unverified_count) > 0) {
    return OPERATIONAL_CRAWL_CODES.DETAIL_IDENTITY_UNVERIFIED;
  }
  if (positive(metrics.detail_sample_count) > 0 && positive(metrics.detail_identity_unavailable_count) === positive(metrics.detail_sample_count)) {
    return OPERATIONAL_CRAWL_CODES.DETAIL_URL_UNVERIFIED;
  }
  if (positive(metrics.detail_content_empty_count) > 0) return OPERATIONAL_CRAWL_CODES.DETAIL_CONTENT_EMPTY_OR_BOILERPLATE;
  if (isZeroMatchCrawlerResult(result) && positive(result.observed_count) === 0) return OPERATIONAL_CRAWL_CODES.ZERO_RECENT_NOTICES;
  if (positive(result?.observed_count) > 0 && positive(matchedCount) === 0) {
    if (positive(filterMetrics?.keyword_match_count) === 0) return OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_KEYWORD;
    if (positive(filterMetrics?.date_match_count) === 0) return OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_DATE;
  }
  return "";
}

function capabilityStatus({ failureCode, metrics }) {
  if (!failureCode && positive(metrics.detail_identity_verified_count) > 0) return "supported";
  if (failureCode === OPERATIONAL_CRAWL_CODES.ZERO_RECENT_NOTICES || failureCode === OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_KEYWORD) {
    return "valid_zero_candidates";
  }
  if (failureCode === OPERATIONAL_CRAWL_CODES.DETAIL_FETCH_FAILED) return "list_supported_detail_failed";
  if (failureCode) return "needs_review";
  return "list_supported_detail_unverified";
}

function recommendedAction(failureCode) {
  const actions = {
    [OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_ZERO_MATCHES]: "review_list_selector",
    [OPERATIONAL_CRAWL_CODES.URL_RESOLUTION_FAILED]: "review_url_resolution",
    [OPERATIONAL_CRAWL_CODES.DETAIL_FETCH_FAILED]: "review_detail_access",
    [OPERATIONAL_CRAWL_CODES.DETAIL_IDENTITY_UNVERIFIED]: "review_detail_identity",
    [OPERATIONAL_CRAWL_CODES.DETAIL_URL_UNVERIFIED]: "review_detail_title_selector",
    [OPERATIONAL_CRAWL_CODES.DETAIL_CONTENT_EMPTY_OR_BOILERPLATE]: "review_detail_content_selector",
    [OPERATIONAL_CRAWL_CODES.UNKNOWN_NEEDS_MANUAL_REVIEW]: "inspect_runtime_evidence",
  };
  return actions[failureCode] ?? "none";
}

export function analyzeOperationalCrawlerSource(input = {}) {
  const result = input.executionResult ?? input.execution_result ?? {};
  const source = input.source ?? {};
  const identity = sourceIdentity(source, result);
  const notices = Array.isArray(input.notices) ? input.notices : result.notices ?? [];
  const parserEvidence = result.parser_evidence ?? input.parserEvidence ?? input.parser_evidence ?? null;
  const metrics = noticeMetrics(notices);
  const matchedCount = positive(input.matchedCount ?? input.matched_count);
  const filterMetrics = input.filterMetrics ?? input.filter_metrics ?? null;
  const failureCode = primaryFailureCode({ result, parserEvidence, metrics, matchedCount, filterMetrics });
  const profiles = inferProfiles({ source, result, parserEvidence, metrics });
  const status = capabilityStatus({ failureCode, metrics });
  const stageEntries = OPERATIONAL_CRAWL_STAGES.map((stage) => ({
    stage,
    status: stage === "final_result" ? status : "observed",
  }));
  return {
    ...identity,
    capability_status: status,
    primary_failure_code: failureCode || null,
    recommended_action: recommendedAction(failureCode),
    runtime_result_status: result.result_status ?? null,
    access_profiles: profiles,
    parser_evidence: parserEvidence,
    metrics: {
      observed_count: positive(result.observed_count ?? notices.length),
      matched_count: matchedCount,
      parsed_date_count: positive(filterMetrics?.parsed_date_count),
      keyword_match_count: positive(filterMetrics?.keyword_match_count),
      date_match_count: positive(filterMetrics?.date_match_count),
      ...metrics,
    },
    stage_entries: stageEntries,
  };
}

export function buildOperationalCrawlDiagnostics(input = {}) {
  const rows = Array.isArray(input.sources) ? input.sources : [];
  const sourceDiagnostics = rows
    .map((row) => analyzeOperationalCrawlerSource(row))
    .sort((left, right) => String(left.source_id).localeCompare(String(right.source_id)));
  const supported = sourceDiagnostics.filter((row) => row.capability_status === "supported").length;
  const needsReview = sourceDiagnostics.filter((row) => row.capability_status === "needs_review").length;
  return {
    version: "operational-crawl-diagnostics-v1",
    generated_from_existing_run: true,
    source_diagnostics: sourceDiagnostics,
    summary: {
      source_count: sourceDiagnostics.length,
      supported_source_count: supported,
      needs_review_source_count: needsReview,
      capability_status_counts: countBy(sourceDiagnostics, (row) => row.capability_status)
        .map(({ key, source_count }) => ({ capability_status: key, source_count })),
      primary_failure_code_counts: countBy(sourceDiagnostics, (row) => row.primary_failure_code)
        .map(({ key, source_count }) => ({ failure_code: key, source_count })),
      access_profile_counts: countBy(sourceDiagnostics.flatMap((row) => row.access_profiles), (profile) => profile)
        .map(({ key, source_count }) => ({ access_profile: key, source_count })),
    },
  };
}

export function validateOperationalCrawlDiagnostics(diagnostics) {
  const rows = Array.isArray(diagnostics?.source_diagnostics) ? diagnostics.source_diagnostics : [];
  const errors = [];
  if (positive(diagnostics?.summary?.source_count) !== rows.length) errors.push("source_count_mismatch");
  const sourceIds = rows.map((row) => clean(row.source_id)).filter(Boolean);
  if (new Set(sourceIds).size !== sourceIds.length) errors.push("duplicate_source_id");
  const statusTotal = (diagnostics?.summary?.capability_status_counts ?? [])
    .reduce((sum, row) => sum + positive(row?.source_count), 0);
  if (statusTotal !== rows.length) errors.push("capability_status_count_mismatch");
  const failureTotal = (diagnostics?.summary?.primary_failure_code_counts ?? [])
    .reduce((sum, row) => sum + positive(row?.source_count), 0);
  if (failureTotal !== rows.filter((row) => row.primary_failure_code).length) errors.push("failure_code_count_mismatch");
  const profileTotal = (diagnostics?.summary?.access_profile_counts ?? [])
    .reduce((sum, row) => sum + positive(row?.source_count), 0);
  if (profileTotal !== rows.reduce((sum, row) => sum + (row.access_profiles?.length ?? 0), 0)) {
    errors.push("access_profile_count_mismatch");
  }
  for (const row of rows) {
    if (!clean(row.source_id)) errors.push("missing_source_id");
    if (!clean(row.capability_status)) errors.push("missing_capability_status");
    if (!Array.isArray(row.access_profiles) || row.access_profiles.length === 0) errors.push("missing_access_profile");
    if (!Array.isArray(row.stage_entries) || row.stage_entries.length !== OPERATIONAL_CRAWL_STAGES.length) errors.push("stage_entries_incomplete");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)].sort() };
}

function escapeCsvCell(value) {
  const text = clean(Array.isArray(value) ? value.join("|") : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildOperationalCrawlDiagnosticsCsv(diagnostics = {}) {
  const rows = Array.isArray(diagnostics.source_diagnostics) ? diagnostics.source_diagnostics : [];
  const body = rows.map((row) => [
    row.source_id, row.source_name, row.university_slug, row.source_level, row.capability_status,
    row.primary_failure_code, row.recommended_action, row.metrics?.observed_count, row.metrics?.matched_count,
    row.metrics?.detail_identity_verified_count, row.metrics?.detail_identity_unverified_count,
    row.metrics?.detail_fetch_failure_count, row.metrics?.detail_content_empty_count, row.access_profiles,
    row.runtime_result_status,
  ].map(escapeCsvCell).join(","));
  return `\uFEFF${[OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS.join(","), ...body].join("\r\n")}`;
}
