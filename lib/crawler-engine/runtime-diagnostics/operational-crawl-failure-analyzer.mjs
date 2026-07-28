import { isSuccessfulCrawlerResult, isZeroMatchCrawlerResult } from "./failure-analyzer.mjs";
import { verifyOperationalDetailTitleIdentity } from "./operational-title-identity.mjs";
import { CONTENT_TOPOLOGY_PROFILES } from "../operational-parser-evidence.mjs";
import { resolveListParserProfile } from "../list-parser-profiles.mjs";

export const OPERATIONAL_CAPABILITY_STATUSES = Object.freeze([
  "supported",
  "list_supported_detail_unverified",
  "list_supported_detail_failed",
  "posts_found_no_scholarship",
  "no_posts_detected",
  "valid_zero_candidates",
  "config_or_selector_fix",
  "adapter_required",
  "manual_review_required",
]);

export const OPERATIONAL_STAGE_STATUSES = Object.freeze([
  "success",
  "warning",
  "failed",
  "skipped",
  "not_observed",
  "manual_review_required",
]);

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
  INLINE_NOTICE_STRUCTURE_DETECTED: "INLINE_NOTICE_STRUCTURE_DETECTED",
  DETAIL_MODEL_MISMATCH: "DETAIL_MODEL_MISMATCH",
  EXTERNAL_LINK_MISCLASSIFIED_AS_DETAIL: "EXTERNAL_LINK_MISCLASSIFIED_AS_DETAIL",
  INLINE_SECTION_IDENTITY_COLLISION: "INLINE_SECTION_IDENTITY_COLLISION",
  INLINE_SECTION_IDENTITY_WEAK: "INLINE_SECTION_IDENTITY_WEAK",
  AUTHORITATIVE_NOTICE_UNDATED: "AUTHORITATIVE_NOTICE_UNDATED",
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

export const OPERATIONAL_CRAWL_METRIC_SEMANTICS = Object.freeze({
  contaminated_candidate_leak_count: "selected_candidate_navigation_leak",
  candidate_navigation_leak_count: "selected_candidate_navigation_leak",
  navigation_url_overlap_count: "duplicate_url_observed_in_navigation",
});

export const PHASE2_REMEDIATION_STATUSES = Object.freeze([
  "not_evaluated",
  "verified_heuristic_safe",
  "configured_selector_applied",
  "parser_profile_applied",
  "list_url_correction_required",
  "adapter_required",
  "blocked_external",
  "blocked_insufficient_authoritative_evidence",
]);

export const PHASE2_ANALYSIS_CODES = Object.freeze({
  EVIDENCE_CONTRADICTION: "ANALYZER_EVIDENCE_CONTRADICTION",
  INVARIANT_VIOLATION: "ANALYZER_INVARIANT_VIOLATION",
  RECALL_UNVERIFIED: "CANDIDATE_RECALL_UNVERIFIED",
});

export const PHASE2_LIST_PARSER_CONTRACT_STATUSES = Object.freeze([
  "verified", "limited_evidence", "invalid", "not_observed", "blocked_external",
]);
export const PHASE2_CANDIDATE_RECALL_STATUSES = Object.freeze([
  "verified", "unverified", "invalid", "not_evaluated",
]);
export const PHASE2_DETAIL_IDENTITY_STATUSES = Object.freeze([
  "verified", "partially_verified", "unverified", "not_observed", "not_required", "blocked_external",
]);
export const PHASE2_PAGINATION_STATUSES = Object.freeze([
  "verified", "unverified", "not_applicable", "blocked_external",
]);
export const PHASE2_RUNTIME_ACCESSIBILITY_STATUSES = Object.freeze([
  "reachable", "intermittent", "blocked_external", "transport_failure", "not_evaluated",
]);

// Additive evidence-backed routing. This deliberately does not replace the
// existing capability status: a capture transport failure is not parser debt.
export const OPERATIONAL_ACTION_CLASSES = Object.freeze([
  "parser_remediation", "transport_recovery", "source_url_review",
  "configuration_review", "no_action", "unresolved",
]);
export const OPERATIONAL_EVIDENCE_BASES = Object.freeze([
  "same_html_delta", "capture_transport_evidence", "manifest_validation",
  "runtime_failure", "semantic_validation", "historical_only",
]);

export function classifyOperationalAction({ result, status, codes, remediationEvidence }) {
  const captureStatus = remediationEvidence?.capture_status;
  const comparison = remediationEvidence?.same_html_comparison;
  const candidate = comparison?.candidate_comparison;
  const exactComparison = remediationEvidence?.comparison_validation_status === "exact_valid";
  const operationalCodes = Array.isArray(codes) ? codes : [];
  if (["transport_failure", "blocked_external"].includes(captureStatus)) {
    return { action_class: "transport_recovery", evidence_basis: "capture_transport_evidence" };
  }

  const countFields = [
    "control_candidate_count", "treatment_candidate_count", "common_candidate_count",
    "removed_candidate_count", "added_candidate_count", "removed_real_notice_count",
    "removed_unresolved_count", "added_false_positive_count",
  ];
  const validCandidateArithmetic = countFields.every((field) => Number.isSafeInteger(candidate?.[field]) && candidate[field] >= 0)
    && candidate.control_candidate_count === candidate.common_candidate_count + candidate.removed_candidate_count
    && candidate.treatment_candidate_count === candidate.common_candidate_count + candidate.added_candidate_count
    && candidate.removed_real_notice_count + candidate.removed_unresolved_count <= candidate.removed_candidate_count
    && candidate.added_false_positive_count <= candidate.added_candidate_count;
  const hasParserRegression = exactComparison && validCandidateArithmetic
    && (candidate.removed_real_notice_count > 0
      || candidate.removed_unresolved_count > 0
      || candidate.added_false_positive_count > 0);
  const isVerifiedEquivalent = exactComparison && candidate?.candidate_recall_verified === true
    && validCandidateArithmetic
    && candidate.removed_candidate_count === 0
    && candidate.added_candidate_count === 0
    && !hasParserRegression;
  const actionEvidence = {
    same_html_comparison_present: Boolean(comparison),
    same_html_comparison_exact_valid: exactComparison,
    candidate_comparison_arithmetic_valid: validCandidateArithmetic,
    verified_same_html_equivalence: isVerifiedEquivalent,
  };

  if (isVerifiedEquivalent) {
    return { action_class: "no_action", evidence_basis: "same_html_delta", action_evidence: actionEvidence };
  }
  if (hasParserRegression) {
    return { action_class: "parser_remediation", evidence_basis: "same_html_delta", action_evidence: actionEvidence };
  }
  if (comparison) return { action_class: "unresolved", evidence_basis: "same_html_delta", action_evidence: actionEvidence };
  if (operationalCodes.includes(OPERATIONAL_CRAWL_CODES.URL_RESOLUTION_FAILED)) {
    return { action_class: "source_url_review", evidence_basis: "runtime_failure", action_evidence: actionEvidence };
  }
  if (operationalCodes.some((code) => [
    OPERATIONAL_CRAWL_CODES.CONFIG_OR_SELECTOR_MISMATCH,
    OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_ZERO_MATCHES,
    OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_MENU_CONTAMINATION,
    OPERATIONAL_CRAWL_CODES.ADAPTER_REQUIRED,
  ].includes(code))) {
    return { action_class: "configuration_review", evidence_basis: "runtime_failure", action_evidence: actionEvidence };
  }
  if (["supported", "posts_found_no_scholarship", "no_posts_detected", "valid_zero_candidates"].includes(status)) {
    return { action_class: "no_action", evidence_basis: "runtime_failure", action_evidence: actionEvidence };
  }
  return { action_class: "unresolved", evidence_basis: "runtime_failure", action_evidence: actionEvidence };
}

export const OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS = Object.freeze([
  "source_id", "source_name", "university_slug", "source_level", "adapter", "parser_strategy", "list_parser_profile", "profile_applied",
  "parser_fallback_recovered", "list_fetch_status", "list_decode_status", "list_parse_status",
  "notice_url_resolution_status", "pagination_status", "detail_fetch_status", "detail_content_status",
  "candidate_filter_status", "list_candidate_count", "title_extract_rate", "date_extract_rate",
  "detail_url_resolution_rate", "detail_url_verified_count", "detail_fetch_success_count",
  "detail_fetch_failure_count", "detail_identity_verified_count", "detail_identity_unverified_count",
  "detail_content_empty_count", "raw_navigation_count", "contaminated_candidate_count",
  "contaminated_candidate_leak_count", "candidate_navigation_leak_count", "navigation_url_overlap_count",
  "filtered_navigation_anchor_count", "filtered_pagination_anchor_count", "observed_count", "keyword_match_count", "date_match_count",
  "matched_count", "capability_status", "action_class", "evidence_basis", "primary_failure_code", "operational_codes", "access_profiles",
  "recommended_action", "manual_review_question", "evidence_summary", "runtime_result_status",
  "content_topology_profiles", "content_mode_declared", "heading_candidate_count",
  "heading_with_body_count", "heading_notice_signal_count", "inline_notice_section_count",
  "inline_body_char_count", "same_origin_link_count", "cross_origin_link_count",
  "cross_origin_link_rate", "independent_detail_url_count", "external_resource_link_count",
  "attachment_link_count", "list_page_contains_candidate_body", "same_origin_detail_link_count",
  "same_origin_navigation_link_count", "same_origin_unknown_link_count",
  "cross_origin_authoritative_detail_link_count",
  "application_form_link_count", "supporting_reference_link_count", "unknown_external_link_count",
  "adapter_capability_verified", "adapter_extracted_notice_count", "detail_fetch_required",
  "detail_content_already_available",
  "inline_section_identity_count", "inline_section_identity_unique_count", "inline_section_identity_collision_count", "checkpoint_work_item_unique_count",
  "published_date_count", "undated_notice_count", "weak_identity_count",
]);

const CODE_PRIORITY = Object.freeze([
  OPERATIONAL_CRAWL_CODES.INLINE_SECTION_IDENTITY_COLLISION,
  OPERATIONAL_CRAWL_CODES.INLINE_SECTION_IDENTITY_WEAK,
  OPERATIONAL_CRAWL_CODES.AUTHORITATIVE_NOTICE_UNDATED,
  OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_ZERO_MATCHES,
  OPERATIONAL_CRAWL_CODES.CONFIG_OR_SELECTOR_MISMATCH,
  OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_MENU_CONTAMINATION,
  OPERATIONAL_CRAWL_CODES.URL_RESOLUTION_FAILED,
  OPERATIONAL_CRAWL_CODES.MANUAL_BROWSER_NETWORK_REQUIRED,
  OPERATIONAL_CRAWL_CODES.ADAPTER_REQUIRED,
  OPERATIONAL_CRAWL_CODES.INLINE_NOTICE_STRUCTURE_DETECTED,
  OPERATIONAL_CRAWL_CODES.DETAIL_MODEL_MISMATCH,
  OPERATIONAL_CRAWL_CODES.EXTERNAL_LINK_MISCLASSIFIED_AS_DETAIL,
  OPERATIONAL_CRAWL_CODES.DETAIL_FETCH_FAILED,
  OPERATIONAL_CRAWL_CODES.DETAIL_CONTENT_EMPTY_OR_BOILERPLATE,
  OPERATIONAL_CRAWL_CODES.DETAIL_IDENTITY_UNVERIFIED,
  OPERATIONAL_CRAWL_CODES.DETAIL_URL_UNVERIFIED,
  OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_KEYWORD,
  OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_DATE,
  OPERATIONAL_CRAWL_CODES.ZERO_RECENT_NOTICES,
  OPERATIONAL_CRAWL_CODES.PAGINATION_UNVERIFIED,
  OPERATIONAL_CRAWL_CODES.UNKNOWN_NEEDS_MANUAL_REVIEW,
]);

const RUNTIME_LIST_FETCH_FAILURES = new Set(["network_error", "timeout", "http_error"]);
const RUNTIME_BLOCKING_FAILURES = new Set([
  "network_error", "timeout", "http_error", "parser_error", "configuration_error",
  "source_resolution_error", "unsupported",
]);

function runtimeListFetchSucceeded(result) {
  return ["success", "empty_observed", "partial"].includes(clean(result?.result_status));
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function observedNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function count(value) {
  return observedNumber(value) ?? 0;
}

function rate(numerator, denominator) {
  const top = observedNumber(numerator);
  const bottom = observedNumber(denominator);
  if (top === null || bottom === null || bottom <= 0) return null;
  return Math.min(1, Math.max(0, top / bottom));
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
    adapter: clean(source.adapter) || executionResult.strategy || "",
  };
}

function collectNoticeMetrics(notices, adapterEvidence, diagnosticDetailProbe = null) {
  if (!Array.isArray(notices)) {
    return {
      detail_sample_count: null,
      detail_fetch_failure_count: null,
      detail_fetch_success_count: null,
      detail_identity_verified_count: null,
      detail_identity_unverified_count: null,
      detail_identity_unavailable_count: null,
      detail_content_empty_count: null,
      detail_content_char_count: null,
      detail_url_verified_count: null,
    };
  }
  const adapterAuthoritative = adapterEvidence?.adapter_capability_verified === true
    && adapterEvidence?.adapter_provides_authoritative_detail === true;
  const detailRows = adapterAuthoritative
    ? notices
    : notices.filter((notice) => clean(notice?.detailResultStatus)
      || clean(notice?.detailFetchError)
      || Array.isArray(notice?.detailTitleCandidates)
      || notice?.detailIdentity);
  const probeAttempted = diagnosticDetailProbe?.status === "success"
    || diagnosticDetailProbe?.status === "failed";
  if (probeAttempted) {
    detailRows.push({
      detailResultStatus: diagnosticDetailProbe.detail_result_status,
      detailFetchError: diagnosticDetailProbe.error,
      content: diagnosticDetailProbe.detail_content_extracted
        ? "x".repeat(Math.max(20, count(diagnosticDetailProbe.detail_content_char_count)))
        : "",
    });
  }
  const identityRows = detailRows.map((notice) => ({
    identity: notice?.detailIdentity ?? (Array.isArray(notice?.detailTitleCandidates)
      ? verifyOperationalDetailTitleIdentity(notice.title, notice.detailTitleCandidates)
      : null),
  })).filter((entry) => entry.identity);
  const failedRows = detailRows.filter((notice) => clean(notice?.detailResultStatus));
  const contentRows = detailRows.filter((notice) => !clean(notice?.detailFetchError));
  const verifiedAdapterCount = adapterAuthoritative ? detailRows.length : 0;
  const identityVerifiedCount = identityRows.filter((entry) => entry.identity.verified === true).length;
  return {
    detail_sample_count: detailRows.length,
    detail_fetch_failure_count: failedRows.length,
    detail_fetch_success_count: Math.max(0, detailRows.length - failedRows.length),
    detail_identity_verified_count: identityVerifiedCount,
    detail_identity_unverified_count: identityRows.filter((entry) => entry.identity.verified === false).length,
    detail_identity_unavailable_count: Math.max(0, detailRows.length - identityRows.length),
    detail_content_empty_count: contentRows.filter((notice) => clean(notice?.content).length < 20).length,
    detail_content_char_count: contentRows.reduce((sum, notice) => sum + clean(notice?.content).length, 0),
    detail_url_verified_count: Math.max(identityVerifiedCount, verifiedAdapterCount),
    diagnostic_detail_probe_attempted_count: probeAttempted ? 1 : 0,
    diagnostic_detail_probe_failure_count: diagnosticDetailProbe?.status === "failed" ? 1 : 0,
    diagnostic_detail_probe_content_empty_count:
      probeAttempted && diagnosticDetailProbe?.detail_content_extracted === false ? 1 : 0,
  };
}

function buildMetrics({ result, parserEvidence, filterMetrics, notices, matchedCount, adapterEvidence }) {
  const listCandidateCount = observedNumber(parserEvidence?.list_candidate_count ?? parserEvidence?.parsed_candidate_count);
  const titleExtractCount = observedNumber(parserEvidence?.title_extract_count);
  const dateExtractCount = observedNumber(parserEvidence?.date_extract_count);
  const resolvedUrlCount = observedNumber(parserEvidence?.resolved_detail_url_count);
  const validUrlCount = observedNumber(parserEvidence?.valid_detail_url_count);
  const noticeMetrics = collectNoticeMetrics(
    notices,
    adapterEvidence,
    result?.diagnostic_detail_probe ?? null,
  );
  const inlineSectionIds = Array.isArray(notices)
    ? notices.map((notice) => clean(notice?.inline_section_id ?? notice?.inlineSectionId)).filter(Boolean)
    : [];
  const inlineSectionIdentityCount = observedNumber(parserEvidence?.inline_section_identity_count) ?? inlineSectionIds.length;
  const inlineSectionIdentityUniqueCount = inlineSectionIds.length > 0
    ? new Set(inlineSectionIds).size
    : observedNumber(result?.item_summary?.checkpoint_work_item_unique_count);
  const rows = Array.isArray(notices) ? notices : [];
  return {
    list_candidate_count: listCandidateCount,
    title_extract_count: titleExtractCount,
    title_extract_rate: rate(titleExtractCount, listCandidateCount),
    date_extract_count: dateExtractCount,
    date_extract_rate: rate(dateExtractCount, listCandidateCount),
    resolved_detail_url_count: resolvedUrlCount,
    valid_detail_url_count: validUrlCount,
    detail_url_resolution_rate: rate(validUrlCount, listCandidateCount),
    raw_navigation_count: observedNumber(parserEvidence?.raw_navigation_count ?? parserEvidence?.navigation_anchor_count),
    contaminated_candidate_count: observedNumber(parserEvidence?.contaminated_candidate_count),
    contaminated_candidate_leak_count: observedNumber(parserEvidence?.contaminated_candidate_leak_count),
    candidate_navigation_leak_count: observedNumber(
      parserEvidence?.candidate_navigation_leak_count ?? parserEvidence?.contaminated_candidate_leak_count,
    ),
    navigation_url_overlap_count: observedNumber(parserEvidence?.navigation_url_overlap_count),
    filtered_navigation_anchor_count: observedNumber(parserEvidence?.filtered_navigation_anchor_count),
    filtered_pagination_anchor_count: observedNumber(parserEvidence?.filtered_pagination_anchor_count),
    pagination_evidence_count: observedNumber(parserEvidence?.pagination_evidence_count),
    pagination_verified: typeof parserEvidence?.pagination_verified === "boolean" ? parserEvidence.pagination_verified : null,
    parser_strategy: parserEvidence?.parser_strategy ?? null,
    list_parser_profile: parserEvidence?.list_parser_profile ?? null,
    profile_applied: parserEvidence?.profile_applied === true,
    parser_fallback_used: typeof parserEvidence?.parser_fallback_used === "boolean"
      ? parserEvidence.parser_fallback_used
      : null,
    parser_fallback_recovered: typeof parserEvidence?.parser_fallback_recovered === "boolean"
      ? parserEvidence.parser_fallback_recovered
      : null,
    heading_candidate_count: observedNumber(parserEvidence?.heading_candidate_count),
    heading_with_body_count: observedNumber(parserEvidence?.heading_with_body_count),
    heading_notice_signal_count: observedNumber(parserEvidence?.heading_notice_signal_count),
    inline_notice_section_count: observedNumber(parserEvidence?.inline_notice_section_count),
    inline_section_identity_count: inlineSectionIdentityCount,
    inline_section_identity_unique_count: inlineSectionIdentityUniqueCount,
    inline_section_identity_collision_count: inlineSectionIdentityCount === null || inlineSectionIdentityUniqueCount === null
      ? null : Math.max(0, inlineSectionIdentityCount - inlineSectionIdentityUniqueCount),
    checkpoint_work_item_unique_count: observedNumber(result?.item_summary?.checkpoint_work_item_unique_count),
    published_date_count: rows.filter((notice) => (notice?.inlineDateEvidence ?? notice?.inline_date_evidence ?? []).some((entry) => entry?.role === "published_date")).length,
    undated_notice_count: rows.filter((notice) => clean(notice?.content ?? notice?.body).length >= 20 && !clean(notice?.dateText ?? notice?.detailDate)).length,
    weak_identity_count: rows.filter((notice) => clean(notice?.identityStability ?? notice?.identity_stability) === "weak").length,
    inline_body_char_count: observedNumber(parserEvidence?.inline_body_char_count),
    inline_section_traversed_node_count:
      observedNumber(parserEvidence?.inline_section_traversed_node_count),
    inline_section_traversal_truncated:
      typeof parserEvidence?.inline_section_traversal_truncated === "boolean"
        ? parserEvidence.inline_section_traversal_truncated
        : null,
    same_origin_link_count: observedNumber(parserEvidence?.same_origin_link_count),
    cross_origin_link_count: observedNumber(parserEvidence?.cross_origin_link_count),
    cross_origin_link_rate: observedNumber(parserEvidence?.cross_origin_link_rate),
    detail_like_same_origin_link_count: observedNumber(parserEvidence?.detail_like_same_origin_link_count),
    same_origin_navigation_link_count:
      observedNumber(parserEvidence?.same_origin_navigation_link_count),
    same_origin_unknown_link_count: observedNumber(parserEvidence?.same_origin_unknown_link_count),
    cross_origin_authoritative_detail_link_count:
      observedNumber(parserEvidence?.cross_origin_authoritative_detail_link_count),
    external_resource_link_count: observedNumber(parserEvidence?.external_resource_link_count),
    attachment_link_count: observedNumber(parserEvidence?.attachment_link_count),
    application_form_link_count: observedNumber(parserEvidence?.application_form_link_count),
    supporting_reference_link_count:
      observedNumber(parserEvidence?.supporting_reference_link_count),
    unknown_external_link_count: observedNumber(parserEvidence?.unknown_external_link_count),
    navigation_link_count: observedNumber(parserEvidence?.navigation_link_count),
    independent_detail_url_count: observedNumber(parserEvidence?.independent_detail_url_count),
    observed_count: observedNumber(result?.observed_count ?? (Array.isArray(notices) ? notices.length : null)),
    parsed_date_count: observedNumber(filterMetrics?.parsed_date_count),
    keyword_match_count: observedNumber(filterMetrics?.keyword_match_count),
    date_match_count: observedNumber(filterMetrics?.date_match_count),
    observed_list_item_count: observedNumber(filterMetrics?.observed_count),
    preliminary_candidate_count: observedNumber(filterMetrics?.preliminary_candidate_count),
    preliminary_not_candidate_count: observedNumber(filterMetrics?.preliminary_not_candidate_count),
    preliminary_out_of_range_count: observedNumber(filterMetrics?.preliminary_out_of_range_count),
    preliminary_undetermined_count: observedNumber(filterMetrics?.preliminary_undetermined_count),
    detail_fetch_planned_count: observedNumber(filterMetrics?.detail_fetch_planned_count),
    detail_fetch_completed_count: observedNumber(filterMetrics?.detail_fetch_completed_count),
    authoritative_content_available_count:
      observedNumber(filterMetrics?.authoritative_content_available_count),
    detail_fetch_skipped_count: observedNumber(filterMetrics?.detail_fetch_skipped_count),
    requests_avoided_by_preliminary_filter:
      observedNumber(filterMetrics?.requests_avoided_by_preliminary_filter),
    final_candidate_count: observedNumber(filterMetrics?.final_candidate_count),
    final_not_candidate_count: observedNumber(filterMetrics?.final_not_candidate_count),
    final_out_of_range_count: observedNumber(filterMetrics?.final_out_of_range_count),
    final_undetermined_count: observedNumber(filterMetrics?.final_undetermined_count),
    candidate_detection_error_count: observedNumber(filterMetrics?.candidate_detection_error_count),
    matched_count: observedNumber(matchedCount),
    ...noticeMetrics,
  };
}

function inferProfiles({ result, parserEvidence, metrics, adapterEvidence }) {
  const profiles = new Set();
  const explicitEmptyWithSuccessfulFetch = parserEvidence?.explicit_empty_state_detected === true
    && runtimeListFetchSucceeded(result);
  const knownProfiles = new Set(Object.values(OPERATIONAL_ACCESS_PROFILES));
  const adapterProfile = clean(adapterEvidence?.adapter_access_profile).toUpperCase();
  if (knownProfiles.has(adapterProfile)) profiles.add(adapterProfile);
  if (count(metrics.valid_detail_url_count) > 0) profiles.add(OPERATIONAL_ACCESS_PROFILES.STATIC_HTML_HREF);
  if (count(parserEvidence?.event_url_evidence_count) > 0) profiles.add(OPERATIONAL_ACCESS_PROFILES.STATIC_HTML_EVENT_URL);
  if (count(metrics.pagination_evidence_count) > 0) profiles.add(OPERATIONAL_ACCESS_PROFILES.SERVER_RENDERED_WITH_PAGINATION);
  if (parserEvidence?.client_rendered_marker_detected === true && count(metrics.list_candidate_count) === 0) {
    profiles.add(OPERATIONAL_ACCESS_PROFILES.CLIENT_RENDERED_OR_JS_REQUIRED);
  }
  const charset = clean(parserEvidence?.response_charset).toLowerCase();
  if (charset && !["utf-8", "utf8"].includes(charset)) profiles.add(OPERATIONAL_ACCESS_PROFILES.LEGACY_CHARSET);
  const transportCategory = clean(result?.final_transport_error_category ?? result?.transport_error_category);
  if (transportCategory === "tls_certificate") profiles.add(OPERATIONAL_ACCESS_PROFILES.TLS_OR_CERTIFICATE_EXCEPTION);
  const httpStatus = observedNumber(result?.http_status);
  if (httpStatus === 429) profiles.add(OPERATIONAL_ACCESS_PROFILES.BOT_BLOCKED_OR_RATE_LIMITED);
  if ([401, 403].includes(httpStatus)) profiles.add(OPERATIONAL_ACCESS_PROFILES.AUTH_OR_CAPTCHA_REQUIRED);
  if (count(metrics.detail_fetch_failure_count) > 0) profiles.add(OPERATIONAL_ACCESS_PROFILES.DETAIL_PAGE_UNREACHABLE);
  const configuredSelectorZeroMatches = Boolean(parserEvidence?.configured_list_selector)
    && observedNumber(parserEvidence?.selector_match_count) !== null
    && count(parserEvidence.selector_match_count) === 0;
  if (configuredSelectorZeroMatches
    && runtimeListFetchSucceeded(result)
    && !explicitEmptyWithSuccessfulFetch) {
    profiles.add(OPERATIONAL_ACCESS_PROFILES.SOURCE_CONFIG_OR_SELECTOR_MISMATCH);
  }
  if (profiles.size === 0 && !explicitEmptyWithSuccessfulFetch) {
    profiles.add(OPERATIONAL_ACCESS_PROFILES.UNKNOWN_NEEDS_MANUAL_REVIEW);
  }
  return [...profiles].sort();
}

function inferContentTopologyProfiles({ source, parserEvidence, metrics, adapterEvidence }) {
  const profiles = new Set();
  const inlineDeclared = clean(source?.contentMode) === "inline_sections";
  const inlineObserved = parserEvidence?.list_page_contains_candidate_body === true
    && count(parserEvidence?.inline_notice_section_count) >= 2
    && count(parserEvidence?.independent_detail_url_count) === 0;
  const adapterAuthoritative = adapterEvidence?.adapter_capability_verified === true
    && adapterEvidence?.adapter_provides_authoritative_detail === true;
  if (inlineDeclared || inlineObserved) {
    profiles.add(CONTENT_TOPOLOGY_PROFILES.INLINE_MULTI_NOTICE_PAGE);
    profiles.add(CONTENT_TOPOLOGY_PROFILES.LIST_PAGE_CONTAINS_AUTHORITATIVE_DETAIL);
    if (count(parserEvidence?.external_resource_link_count) > 0) {
      profiles.add(CONTENT_TOPOLOGY_PROFILES.EXTERNAL_LINKS_ARE_SUPPORTING_RESOURCES);
    }
  } else if (adapterAuthoritative || count(metrics.valid_detail_url_count) > 0) {
    profiles.add(CONTENT_TOPOLOGY_PROFILES.LIST_DETAIL_PAGES);
  } else {
    profiles.add(CONTENT_TOPOLOGY_PROFILES.UNKNOWN_CONTENT_TOPOLOGY);
  }
  return [...profiles].sort();
}

function inferOperationalCodes({ result, parserEvidence, filterMetrics, metrics, profiles, contentTopologyProfiles, adapterEvidence }) {
  const codes = new Set();
  const adapterAuthoritative = adapterEvidence?.adapter_capability_verified === true
    && adapterEvidence?.adapter_provides_authoritative_detail === true;
  if (count(metrics.inline_section_identity_collision_count) > 0
    || (count(metrics.inline_section_identity_count) > 0
      && metrics.checkpoint_work_item_unique_count !== null
      && count(metrics.checkpoint_work_item_unique_count) < count(metrics.inline_section_identity_count))) {
    codes.add(OPERATIONAL_CRAWL_CODES.INLINE_SECTION_IDENTITY_COLLISION);
  }
  if (count(metrics.weak_identity_count) > 0) codes.add(OPERATIONAL_CRAWL_CODES.INLINE_SECTION_IDENTITY_WEAK);
  if (adapterAuthoritative && count(metrics.undated_notice_count) > 0) codes.add(OPERATIONAL_CRAWL_CODES.AUTHORITATIVE_NOTICE_UNDATED);
  const configuredSelectorObserved = Boolean(parserEvidence?.configured_list_selector)
    && observedNumber(parserEvidence?.selector_match_count) !== null;
  const explicitEmptyObserved = parserEvidence?.explicit_empty_state_detected === true;
  const explicitEmptyWithSuccessfulFetch = explicitEmptyObserved && runtimeListFetchSucceeded(result);
  const selectorRowsObserved = observedNumber(parserEvidence?.selector_match_count) !== null
    && count(parserEvidence?.selector_match_count) > 0;
  if (configuredSelectorObserved
    && runtimeListFetchSucceeded(result)
    && count(parserEvidence.selector_match_count) === 0
    && !explicitEmptyWithSuccessfulFetch) {
    codes.add(OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_ZERO_MATCHES);
    codes.add(OPERATIONAL_CRAWL_CODES.CONFIG_OR_SELECTOR_MISMATCH);
  }
  if (count(metrics.candidate_navigation_leak_count) > 0) {
    codes.add(OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_MENU_CONTAMINATION);
  }
  const inlineTopology = contentTopologyProfiles.includes(CONTENT_TOPOLOGY_PROFILES.INLINE_MULTI_NOTICE_PAGE);
  if (inlineTopology) {
    codes.add(OPERATIONAL_CRAWL_CODES.INLINE_NOTICE_STRUCTURE_DETECTED);
    if (count(metrics.diagnostic_detail_probe_failure_count) > 0) {
      codes.add(OPERATIONAL_CRAWL_CODES.DETAIL_MODEL_MISMATCH);
    }
    if (count(parserEvidence?.external_resource_link_count) > 0 && count(metrics.detail_fetch_failure_count) > 0) {
      codes.add(OPERATIONAL_CRAWL_CODES.EXTERNAL_LINK_MISCLASSIFIED_AS_DETAIL);
    }
  }
  if (!inlineTopology && ((count(metrics.list_candidate_count) > 0 && count(metrics.valid_detail_url_count) === 0)
    || (selectorRowsObserved
      && count(metrics.list_candidate_count) === 0
      && count(metrics.valid_detail_url_count) === 0)
    || (selectorRowsObserved && count(metrics.resolved_detail_url_count) === 0))) {
    codes.add(OPERATIONAL_CRAWL_CODES.URL_RESOLUTION_FAILED);
  }
  if (count(parserEvidence?.manual_network_evidence_required_count) > 0
    && count(metrics.valid_detail_url_count) === 0) {
    codes.add(OPERATIONAL_CRAWL_CODES.MANUAL_BROWSER_NETWORK_REQUIRED);
  }
  if (!inlineTopology && count(metrics.detail_fetch_failure_count) > 0) codes.add(OPERATIONAL_CRAWL_CODES.DETAIL_FETCH_FAILED);
  if (!adapterAuthoritative && count(metrics.detail_content_empty_count) > 0) {
    codes.add(OPERATIONAL_CRAWL_CODES.DETAIL_CONTENT_EMPTY_OR_BOILERPLATE);
  }
  if (count(metrics.detail_identity_unverified_count) > 0) codes.add(OPERATIONAL_CRAWL_CODES.DETAIL_IDENTITY_UNVERIFIED);
  if (!adapterAuthoritative
    && count(metrics.detail_sample_count) > 0
    && count(metrics.detail_url_verified_count) === 0
    && count(metrics.detail_identity_unverified_count) === 0) {
    codes.add(OPERATIONAL_CRAWL_CODES.DETAIL_URL_UNVERIFIED);
  }
  if (count(metrics.pagination_evidence_count) > 0 && metrics.pagination_verified === false) {
    codes.add(OPERATIONAL_CRAWL_CODES.PAGINATION_UNVERIFIED);
  }
  const adapterNeeded = (profiles.some((profile) => [
    OPERATIONAL_ACCESS_PROFILES.FORM_POST_REDIRECT,
    OPERATIONAL_ACCESS_PROFILES.JSON_XHR_API,
    OPERATIONAL_ACCESS_PROFILES.CLIENT_RENDERED_OR_JS_REQUIRED,
  ].includes(profile)) || inlineTopology) && adapterEvidence?.adapter_capability_verified !== true;
  if (adapterNeeded) codes.add(OPERATIONAL_CRAWL_CODES.ADAPTER_REQUIRED);

  const filterObserved = filterMetrics !== null && filterMetrics !== undefined;
  if (filterObserved && count(metrics.observed_count) > 0 && count(metrics.matched_count) === 0) {
    if (metrics.keyword_match_count === 0) codes.add(OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_KEYWORD);
    else if (count(metrics.keyword_match_count) > 0 && metrics.date_match_count === 0) {
      codes.add(OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_DATE);
    }
  }
  const parserObserved = parserEvidence !== null && parserEvidence !== undefined;
  const adapterObservedEmpty = adapterEvidence?.adapter_capability_verified === true
    && adapterEvidence?.adapter_provides_authoritative_detail === true
    && isZeroMatchCrawlerResult(result)
    && count(metrics.observed_count) === 0;
  if (explicitEmptyWithSuccessfulFetch || adapterObservedEmpty) {
    codes.add(OPERATIONAL_CRAWL_CODES.ZERO_RECENT_NOTICES);
  }

  const runtimeStatus = clean(result?.result_status);
  if (runtimeStatus && RUNTIME_BLOCKING_FAILURES.has(runtimeStatus)
    && !codes.has(OPERATIONAL_CRAWL_CODES.DETAIL_FETCH_FAILED)
    && !codes.has(OPERATIONAL_CRAWL_CODES.CONFIG_OR_SELECTOR_MISMATCH)
    && !codes.has(OPERATIONAL_CRAWL_CODES.ADAPTER_REQUIRED)) {
    codes.add(OPERATIONAL_CRAWL_CODES.UNKNOWN_NEEDS_MANUAL_REVIEW);
  }
  if (codes.size === 0 && ((parserObserved
    && count(metrics.list_candidate_count) === 0
    && !explicitEmptyWithSuccessfulFetch
    && !adapterAuthoritative)
    || (!parserObserved && !adapterAuthoritative && !filterObserved))) {
    codes.add(OPERATIONAL_CRAWL_CODES.UNKNOWN_NEEDS_MANUAL_REVIEW);
  }
  return CODE_PRIORITY.filter((code) => codes.has(code));
}

function capabilityStatus({ result, codes, metrics, profiles, adapterEvidence, parserEvidence, filterMetrics }) {
  const has = (code) => codes.includes(code);
  if (has(OPERATIONAL_CRAWL_CODES.INLINE_SECTION_IDENTITY_COLLISION)) return "manual_review_required";
  if (has(OPERATIONAL_CRAWL_CODES.INLINE_SECTION_IDENTITY_WEAK)
    || has(OPERATIONAL_CRAWL_CODES.AUTHORITATIVE_NOTICE_UNDATED)) return "list_supported_detail_unverified";
  if (has(OPERATIONAL_CRAWL_CODES.MANUAL_BROWSER_NETWORK_REQUIRED)) return "manual_review_required";
  if (has(OPERATIONAL_CRAWL_CODES.ADAPTER_REQUIRED)) return "adapter_required";
  if (has(OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_ZERO_MATCHES)
    || has(OPERATIONAL_CRAWL_CODES.CONFIG_OR_SELECTOR_MISMATCH)
    || has(OPERATIONAL_CRAWL_CODES.URL_RESOLUTION_FAILED)
    || has(OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_MENU_CONTAMINATION)) return "config_or_selector_fix";
  if (has(OPERATIONAL_CRAWL_CODES.DETAIL_FETCH_FAILED)) return "list_supported_detail_failed";
  if (has(OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_KEYWORD)) return "posts_found_no_scholarship";
  if (has(OPERATIONAL_CRAWL_CODES.FILTERED_OUT_BY_DATE)) return "valid_zero_candidates";
  if (has(OPERATIONAL_CRAWL_CODES.ZERO_RECENT_NOTICES)) return "no_posts_detected";
  if (has(OPERATIONAL_CRAWL_CODES.DETAIL_URL_UNVERIFIED)
    || has(OPERATIONAL_CRAWL_CODES.DETAIL_IDENTITY_UNVERIFIED)
    || has(OPERATIONAL_CRAWL_CODES.DETAIL_CONTENT_EMPTY_OR_BOILERPLATE)
    || has(OPERATIONAL_CRAWL_CODES.PAGINATION_UNVERIFIED)) return "list_supported_detail_unverified";
  const verifiedAdapter = adapterEvidence?.adapter_capability_verified === true
    && adapterEvidence?.adapter_provides_authoritative_detail === true;
  if ((count(metrics.detail_identity_verified_count) > 0 || verifiedAdapter)
    && (isSuccessfulCrawlerResult(result) || isZeroMatchCrawlerResult(result))) return "supported";
  if (has(OPERATIONAL_CRAWL_CODES.UNKNOWN_NEEDS_MANUAL_REVIEW)
    || profiles.includes(OPERATIONAL_ACCESS_PROFILES.AUTH_OR_CAPTCHA_REQUIRED)
    || profiles.includes(OPERATIONAL_ACCESS_PROFILES.BOT_BLOCKED_OR_RATE_LIMITED)) return "manual_review_required";
  if (parserEvidence && count(metrics.list_candidate_count) > 0) return "list_supported_detail_unverified";
  if (filterMetrics && count(metrics.matched_count) === 0) return "valid_zero_candidates";
  return "manual_review_required";
}

function stageStatus(stage, context) {
  const { result, parserEvidence, metrics, capabilityStatus: finalStatus, adapterEvidence } = context;
  const runtimeStatus = clean(result?.result_status);
  const adapterVerified = adapterEvidence?.adapter_capability_verified === true;
  if (stage === "list_fetch") {
    if (RUNTIME_LIST_FETCH_FAILURES.has(runtimeStatus)) return "failed";
    if (runtimeListFetchSucceeded(result) || adapterVerified) return "success";
    return runtimeStatus ? "failed" : "not_observed";
  }
  if (stage === "list_decode") {
    if (RUNTIME_LIST_FETCH_FAILURES.has(runtimeStatus)) return "skipped";
    if (adapterVerified) return "skipped";
    if (!parserEvidence) return "not_observed";
    return clean(parserEvidence.response_charset)
      && !["utf-8", "utf8"].includes(clean(parserEvidence.response_charset).toLowerCase())
      ? "warning"
      : "success";
  }
  if (stage === "list_parse") {
    if (adapterVerified) return "success";
    if (!parserEvidence) return RUNTIME_LIST_FETCH_FAILURES.has(runtimeStatus) ? "skipped" : "not_observed";
    if (RUNTIME_LIST_FETCH_FAILURES.has(runtimeStatus)) return "skipped";
    if (RUNTIME_BLOCKING_FAILURES.has(runtimeStatus)) return "failed";
    if (parserEvidence.explicit_empty_state_detected === true && runtimeListFetchSucceeded(result)) return "success";
    if (parserEvidence.configured_list_selector && count(parserEvidence.selector_match_count) === 0) return "failed";
    if (count(metrics.contaminated_candidate_leak_count) > 0) return "warning";
    if (metrics.list_candidate_count !== null) return "success";
    return "not_observed";
  }
  if (stage === "notice_url_resolution") {
    if (adapterVerified && count(metrics.observed_count) > 0) return "success";
    if (metrics.list_candidate_count === null) return "not_observed";
    const selectorRowsObserved = observedNumber(parserEvidence?.selector_match_count) !== null
      && count(parserEvidence?.selector_match_count) > 0;
    if (metrics.list_candidate_count === 0) {
      return selectorRowsObserved && count(metrics.valid_detail_url_count) === 0 ? "failed" : "skipped";
    }
    if (count(metrics.valid_detail_url_count) === 0) return "failed";
    return count(metrics.valid_detail_url_count) === count(metrics.list_candidate_count) ? "success" : "warning";
  }
  if (stage === "pagination_check") {
    if (!parserEvidence || adapterVerified) return "skipped";
    if (metrics.pagination_evidence_count === null || metrics.pagination_evidence_count === 0) return "skipped";
    return metrics.pagination_verified === true ? "success" : metrics.pagination_verified === false ? "warning" : "not_observed";
  }
  if (stage === "detail_fetch") {
    if (adapterVerified) return "skipped";
    if (metrics.detail_sample_count === null) return "not_observed";
    if (metrics.detail_sample_count === 0) return "skipped";
    if (count(metrics.detail_fetch_failure_count) === 0) return "success";
    return count(metrics.detail_fetch_success_count) > 0 ? "warning" : "failed";
  }
  if (stage === "detail_content_extract") {
    if (adapterVerified && adapterEvidence.adapter_provides_authoritative_detail === true) return "success";
    if (metrics.detail_sample_count === null) return "not_observed";
    if (metrics.detail_sample_count === 0) return "skipped";
    if (count(metrics.detail_fetch_success_count) === 0) return "skipped";
    if (count(metrics.detail_content_empty_count) === 0) return "success";
    return count(metrics.detail_content_empty_count) < count(metrics.detail_fetch_success_count) ? "warning" : "failed";
  }
  if (stage === "candidate_filter") {
    if (metrics.keyword_match_count === null || metrics.date_match_count === null) return "not_observed";
    if (count(metrics.observed_count) > 0 && metrics.parsed_date_count === 0) return "warning";
    return "success";
  }
  if (["supported", "posts_found_no_scholarship", "no_posts_detected", "valid_zero_candidates"].includes(finalStatus)) {
    return "success";
  }
  if (finalStatus === "list_supported_detail_unverified") return "warning";
  if (finalStatus === "manual_review_required") return "manual_review_required";
  return "failed";
}

function recommendedAction(status, primaryCode, contentTopologyProfiles = []) {
  const actions = {
    supported: "none",
    list_supported_detail_unverified: "review_detail_evidence",
    list_supported_detail_failed: "review_detail_access",
    posts_found_no_scholarship: "none",
    no_posts_detected: "monitor_source",
    valid_zero_candidates: "none",
    config_or_selector_fix: "review_list_selector",
    adapter_required: "implement_or_verify_adapter",
    manual_review_required: "inspect_runtime_evidence",
  };
  if (primaryCode === OPERATIONAL_CRAWL_CODES.ADAPTER_REQUIRED
    && contentTopologyProfiles.includes(CONTENT_TOPOLOGY_PROFILES.INLINE_MULTI_NOTICE_PAGE)) {
    return "implement_inline_section_adapter";
  }
  if (primaryCode === OPERATIONAL_CRAWL_CODES.URL_RESOLUTION_FAILED) return "review_url_resolution";
  if (primaryCode === OPERATIONAL_CRAWL_CODES.DETAIL_IDENTITY_UNVERIFIED) return "review_detail_identity";
  return actions[status] ?? "inspect_runtime_evidence";
}

function manualReviewQuestion(status, primaryCode, contentTopologyProfiles = []) {
  if (status !== "manual_review_required" && status !== "adapter_required" && status !== "config_or_selector_fix") return null;
  const questions = {
    [OPERATIONAL_CRAWL_CODES.LIST_SELECTOR_ZERO_MATCHES]: "Does the configured selector still identify the notice rows on the rendered list page?",
    [OPERATIONAL_CRAWL_CODES.URL_RESOLUTION_FAILED]: "Which list-page field contains the authoritative detail URL or event payload?",
    [OPERATIONAL_CRAWL_CODES.ADAPTER_REQUIRED]: contentTopologyProfiles.includes(
      CONTENT_TOPOLOGY_PROFILES.INLINE_MULTI_NOTICE_PAGE,
    )
      ? "Which repeated heading/body boundary identifies each inline notice, and which links are only attachments, forms, or supporting references?"
      : "Does this source require JSON/XHR, form POST, or client-rendered network evidence?",
    [OPERATIONAL_CRAWL_CODES.MANUAL_BROWSER_NETWORK_REQUIRED]: "Which browser network request resolves the placeholder notice link?",
  };
  return questions[primaryCode] ?? "Is the available parser and runtime evidence sufficient to confirm this source capability?";
}

function evidenceSummary(metrics, parserEvidence, contentTopologyProfiles = []) {
  const parts = [
    `list_candidates=${metrics.list_candidate_count ?? "unknown"}`,
    `valid_urls=${metrics.valid_detail_url_count ?? "unknown"}`,
    `detail_success=${metrics.detail_fetch_success_count ?? "unknown"}`,
    `identity_verified=${metrics.detail_identity_verified_count ?? "unknown"}`,
    `keyword_matches=${metrics.keyword_match_count ?? "unknown"}`,
    `date_matches=${metrics.date_match_count ?? "unknown"}`,
    `content_topology=${contentTopologyProfiles.join("|") || "unknown"}`,
    `inline_sections=${metrics.inline_notice_section_count ?? "unknown"}`,
    `inline_identity_collisions=${metrics.inline_section_identity_collision_count ?? "unknown"}`,
    `weak_identity=${metrics.weak_identity_count ?? "unknown"}`,
    `undated=${metrics.undated_notice_count ?? "unknown"}`,
    `inline_body_chars=${metrics.inline_body_char_count ?? "unknown"}`,
    `independent_detail_urls=${metrics.independent_detail_url_count ?? "unknown"}`,
    `same_origin_detail_links=${metrics.detail_like_same_origin_link_count ?? "unknown"}`,
    `same_origin_unknown_links=${metrics.same_origin_unknown_link_count ?? "unknown"}`,
    `external_resources=${metrics.external_resource_link_count ?? "unknown"}`,
    `content_mode_declared=${parserEvidence?.content_mode_declared ?? "unknown"}`,
  ];
  if (parserEvidence?.configured_list_selector) {
    parts.push(`configured_selector_matches=${parserEvidence.selector_match_count ?? "unknown"}`);
  }
  return parts.join("; ");
}

function phase2RuntimeAccessibility(control = {}, treatment = {}) {
  const controlStatus = clean(control.runtime_result_status);
  const treatmentStatus = clean(treatment.runtime_result_status);
  const sharedExternalFailure = RUNTIME_BLOCKING_FAILURES.has(controlStatus)
    && controlStatus === treatmentStatus;
  const status = sharedExternalFailure ? "blocked_external"
    : RUNTIME_BLOCKING_FAILURES.has(treatmentStatus) ? "transport_failure"
      : treatmentStatus === "partial" ? "intermittent"
        : runtimeListFetchSucceeded({ result_status: treatmentStatus }) ? "reachable"
          : "not_evaluated";
  return {
    control_runtime_result_status: controlStatus || null,
    treatment_runtime_result_status: treatmentStatus || null,
    shared_external_failure: sharedExternalFailure,
    status,
  };
}

function phase2Recall(candidateComparison, analysisCodes) {
  if (!candidateComparison) {
    analysisCodes.push(PHASE2_ANALYSIS_CODES.RECALL_UNVERIFIED);
    return { status: "unverified", verified: false, candidate_recall_verified: false, evidence_present: false };
  }
  const fields = [
    "control_candidate_count", "treatment_candidate_count", "common_candidate_count",
    "removed_candidate_count", "added_candidate_count", "removed_real_notice_count",
    "removed_unresolved_count", "added_false_positive_count",
  ];
  const phase2Count = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const values = Object.fromEntries(fields.map((field) => [field, phase2Count(candidateComparison[field])]));
  if (fields.some((field) => values[field] === null)
    || values.common_candidate_count > values.control_candidate_count
    || values.common_candidate_count > values.treatment_candidate_count
    || values.removed_candidate_count > values.control_candidate_count
    || values.added_candidate_count > values.treatment_candidate_count
    || values.control_candidate_count !== values.common_candidate_count + values.removed_candidate_count
    || values.treatment_candidate_count !== values.common_candidate_count + values.added_candidate_count
    || values.removed_real_notice_count + values.removed_unresolved_count > values.removed_candidate_count
    || values.added_false_positive_count > values.added_candidate_count) {
    analysisCodes.push(PHASE2_ANALYSIS_CODES.EVIDENCE_CONTRADICTION);
    return { status: "invalid", verified: false, candidate_recall_verified: false, evidence_present: true, ...values };
  }
  const verified = values.removed_real_notice_count === 0
    && values.removed_unresolved_count === 0
    && values.added_false_positive_count === 0;
  if (candidateComparison.candidate_recall_verified === true && !verified) {
    analysisCodes.push(PHASE2_ANALYSIS_CODES.EVIDENCE_CONTRADICTION);
    return { status: "invalid", verified: false, candidate_recall_verified: false, evidence_present: true, ...values };
  }
  if (!verified) analysisCodes.push(PHASE2_ANALYSIS_CODES.RECALL_UNVERIFIED);
  return {
    status: verified ? "verified" : "unverified",
    verified,
    candidate_recall_verified: verified,
    evidence_present: true,
    ...values,
  };
}

export function analyzePhase2ParserRemediation(input = {}) {
  const control = input.controlDiagnostic ?? input.control_diagnostic ?? {};
  const treatment = input.treatmentDiagnostic ?? input.treatment_diagnostic ?? {};
  const metrics = treatment.metrics ?? {};
  const parserEvidence = treatment.parser_evidence ?? {};
  const analysisCodes = [];
  const recall = phase2Recall(input.candidateComparison ?? input.candidate_comparison ?? null, analysisCodes);
  const runtimeAccessibility = phase2RuntimeAccessibility(control, treatment);
  const parserContract = {
    mode: parserEvidence.profile_applied === true ? "parser_profile"
      : clean(parserEvidence.configured_list_selector) ? "configured_selector"
        : clean(parserEvidence.parser_strategy) || "unobserved",
    profile_id: parserEvidence.list_parser_profile ?? null,
    candidate_navigation_leak_count: observedNumber(metrics.candidate_navigation_leak_count),
    selector_match_count: observedNumber(parserEvidence.selector_match_count),
    configured_selector: clean(parserEvidence.configured_list_selector) || null,
    fixture_match_evidence: input.authoritativeFixtureMatchEvidence === true
      || input.authoritative_fixture_match_evidence === true,
  };
  const detailIdentity = {
    verified_count: count(metrics.detail_identity_verified_count),
    unverified_count: count(metrics.detail_identity_unverified_count),
  };
  const pagination = {
    verified: metrics.pagination_verified ?? null,
    evidence_count: metrics.pagination_evidence_count ?? null,
  };
  const parserComparisonSafe = recall.verified
    && recall.removed_real_notice_count === 0
    && recall.removed_unresolved_count === 0
    && recall.added_false_positive_count === 0;
  const configuredSelectorValid = parserContract.mode !== "configured_selector"
    || (parserContract.configured_selector
      && (count(parserContract.selector_match_count) > 0 || parserContract.fixture_match_evidence));
  const profileValid = parserContract.mode !== "parser_profile"
    || (parserEvidence.profile_applied === true
      && clean(parserContract.profile_id)
      && resolveListParserProfile(parserContract.profile_id));
  const parserInvariantValid = configuredSelectorValid && profileValid;
  if (!parserInvariantValid) analysisCodes.push(PHASE2_ANALYSIS_CODES.INVARIANT_VIOLATION);
  const listParserContractStatus = runtimeAccessibility.status === "blocked_external" ? "blocked_external"
    : !clean(parserEvidence.parser_strategy) ? "not_observed"
      : !parserInvariantValid || parserContract.candidate_navigation_leak_count > 0 ? "invalid"
        : parserComparisonSafe && parserContract.candidate_navigation_leak_count === 0 ? "verified"
          : "limited_evidence";
  const detailIdentityStatus = runtimeAccessibility.status === "blocked_external" ? "blocked_external"
    : treatment.adapter_evidence?.adapter_capability_verified === true
      && treatment.adapter_evidence?.adapter_provides_authoritative_detail === true ? "not_required"
      : detailIdentity.verified_count >= 3 ? "verified"
        : detailIdentity.verified_count > 0 ? "partially_verified"
          : count(metrics.detail_sample_count) > 0 || count(metrics.list_candidate_count) > 0 ? "unverified"
            : "not_observed";
  const paginationStatus = runtimeAccessibility.status === "blocked_external" ? "blocked_external"
    : pagination.evidence_count === 0 ? "not_applicable"
      : pagination.verified === true ? "verified"
        : "unverified";
  let phase2Status = "blocked_insufficient_authoritative_evidence";
  let nextAction = "collect_fixture_evidence";
  let nextPhaseQueue = "fixture_evidence";
  let blockingReason = recall.verified ? "insufficient_parser_evidence" : "candidate_recall_unverified";
  if (runtimeAccessibility.status === "blocked_external") {
    phase2Status = "blocked_external";
    nextAction = "retry_when_reachable";
    nextPhaseQueue = "external_retry";
    blockingReason = "shared_external_runtime_failure";
  } else if (treatment.capability_status === "adapter_required") {
    phase2Status = "adapter_required";
    nextAction = "implement_adapter";
    nextPhaseQueue = "phase4_adapter";
    blockingReason = "adapter_required";
  } else if (analysisCodes.includes(PHASE2_ANALYSIS_CODES.EVIDENCE_CONTRADICTION)) {
    nextAction = "reconcile_evidence";
    nextPhaseQueue = "evidence_reconciliation";
    blockingReason = "contradictory_candidate_comparison";
  } else if (listParserContractStatus === "verified"
    && clean(treatment.runtime_result_status) === "success"
  ) {
    if (input.listUrlCorrectionRequired === true || input.list_url_correction_required === true) {
      phase2Status = "list_url_correction_required";
    } else if (parserContract.mode === "configured_selector") {
      phase2Status = "configured_selector_applied";
    } else if (parserContract.mode === "parser_profile") {
      phase2Status = "parser_profile_applied";
    } else {
      phase2Status = "verified_heuristic_safe";
    }
    if (detailIdentityStatus === "unverified" || detailIdentityStatus === "partially_verified") {
      nextAction = "collect_detail_identity_evidence";
      nextPhaseQueue = "detail_identity_verification";
      blockingReason = "detail_identity_unverified";
    } else if (paginationStatus === "unverified") {
      nextAction = "collect_pagination_evidence";
      nextPhaseQueue = "pagination_verification";
      blockingReason = "pagination_unverified";
    } else {
      nextAction = "none";
      nextPhaseQueue = "none";
      blockingReason = null;
    }
  }
  const analysisValid = !analysisCodes.includes(PHASE2_ANALYSIS_CODES.EVIDENCE_CONTRADICTION)
    && !analysisCodes.includes(PHASE2_ANALYSIS_CODES.INVARIANT_VIOLATION);
  return {
    analysis_valid: analysisValid,
    analysis_codes: [...new Set(analysisCodes)].sort(),
    phase2_status: phase2Status,
    parser_contract: parserContract,
    candidate_recall: recall,
    detail_identity: detailIdentity,
    pagination,
    runtime_accessibility: runtimeAccessibility,
    list_parser_contract_status: listParserContractStatus,
    candidate_recall_status: recall.status,
    detail_identity_status: detailIdentityStatus,
    pagination_status: paginationStatus,
    runtime_accessibility_status: runtimeAccessibility.status,
    next_action: nextAction,
    next_phase_queue: nextPhaseQueue,
    blocking_reason: blockingReason,
  };
}

function notEvaluatedPhase2Analysis(metrics, parserEvidence, result) {
  return {
    analysis_valid: true,
    analysis_codes: [],
    phase2_status: "not_evaluated",
    parser_contract: {
      mode: parserEvidence?.profile_applied === true ? "parser_profile"
        : clean(parserEvidence?.configured_list_selector) ? "configured_selector"
          : clean(parserEvidence?.parser_strategy) || "unobserved",
      profile_id: parserEvidence?.list_parser_profile ?? null,
      candidate_navigation_leak_count: observedNumber(metrics.candidate_navigation_leak_count),
    },
    candidate_recall: {
      status: "not_evaluated", verified: false, candidate_recall_verified: false, evidence_present: false,
    },
    detail_identity: {
      verified_count: count(metrics.detail_identity_verified_count),
      unverified_count: count(metrics.detail_identity_unverified_count),
    },
    pagination: { verified: metrics.pagination_verified ?? null, evidence_count: metrics.pagination_evidence_count ?? null },
    runtime_accessibility: phase2RuntimeAccessibility({}, { runtime_result_status: result?.result_status }),
    list_parser_contract_status: !clean(parserEvidence?.parser_strategy) ? "not_observed" : "limited_evidence",
    candidate_recall_status: "not_evaluated",
    detail_identity_status: count(metrics.detail_identity_verified_count) >= 3 ? "verified"
      : count(metrics.detail_identity_verified_count) > 0 ? "partially_verified"
        : count(metrics.detail_sample_count) > 0 ? "unverified" : "not_observed",
    pagination_status: metrics.pagination_evidence_count === 0 ? "not_applicable" : "unverified",
    runtime_accessibility_status: phase2RuntimeAccessibility({}, { runtime_result_status: result?.result_status }).status,
    next_action: "none",
    next_phase_queue: "not_evaluated",
    blocking_reason: null,
  };
}

export function analyzeOperationalCrawlerSource(input = {}) {
  const result = input.executionResult ?? input.execution_result ?? {};
  const source = input.source ?? {};
  const notices = Array.isArray(input.notices)
    ? input.notices
    : Array.isArray(result.notices)
      ? result.notices
      : null;
  const parserEvidence = result.parser_evidence ?? input.parserEvidence ?? input.parser_evidence ?? null;
  const filterMetrics = input.filterMetrics ?? input.filter_metrics ?? null;
  const adapterEvidence = result.adapter_evidence ?? input.adapterEvidence ?? input.adapter_evidence ?? null;
  const matchedCount = input.matchedCount ?? input.matched_count ?? null;
  const candidateDetection = input.candidateDetection ?? input.candidate_detection ?? null;
  const metrics = buildMetrics({ result, parserEvidence, filterMetrics, notices, matchedCount, adapterEvidence });
  const profiles = inferProfiles({ result, parserEvidence, metrics, adapterEvidence });
  const contentTopologyProfiles = inferContentTopologyProfiles({ source, parserEvidence, metrics, adapterEvidence });
  const operationalCodes = inferOperationalCodes({
    result, parserEvidence, filterMetrics, metrics, profiles, contentTopologyProfiles, adapterEvidence,
  });
  const status = capabilityStatus({
    result, codes: operationalCodes, metrics, profiles, adapterEvidence, parserEvidence, filterMetrics,
  });
  const primaryFailureCode = operationalCodes[0] ?? null;
  const stageEntries = OPERATIONAL_CRAWL_STAGES.map((stage) => ({
    stage,
    status: stageStatus(stage, {
      result, parserEvidence, metrics, capabilityStatus: status, adapterEvidence,
    }),
  }));
  const phase2Analysis = notEvaluatedPhase2Analysis(metrics, parserEvidence, result);
  const action = classifyOperationalAction({ result, status, codes: operationalCodes, remediationEvidence: input.remediationEvidence ?? input.remediation_evidence });
  return {
    ...sourceIdentity(source, result),
    capability_status: status,
    primary_failure_code: primaryFailureCode,
    operational_codes: operationalCodes,
    access_profiles: profiles,
    content_topology_profiles: contentTopologyProfiles,
    recommended_action: recommendedAction(status, primaryFailureCode, contentTopologyProfiles),
    manual_review_question: manualReviewQuestion(
      status,
      primaryFailureCode,
      contentTopologyProfiles,
    ),
    evidence_summary: evidenceSummary(metrics, parserEvidence, contentTopologyProfiles),
    runtime_result_status: result.result_status ?? null,
    candidate_detection_status: candidateDetection?.status ?? null,
    parser_evidence: parserEvidence,
    adapter_evidence: adapterEvidence,
    metrics,
    stage_entries: stageEntries,
    ...action,
    ...phase2Analysis,
  };
}

export function buildOperationalCrawlDiagnostics(input = {}) {
  const rows = Array.isArray(input.sources) ? input.sources : [];
  const sourceDiagnostics = rows
    .map((row) => analyzeOperationalCrawlerSource(row))
    .sort((left, right) => String(left.source_id).localeCompare(String(right.source_id)));
  return {
    version: "operational-crawl-diagnostics-v2",
    metric_semantics: OPERATIONAL_CRAWL_METRIC_SEMANTICS,
    generated_from_existing_run: true,
    source_diagnostics: sourceDiagnostics,
    summary: {
      source_count: sourceDiagnostics.length,
      supported_source_count: sourceDiagnostics.filter((row) => row.capability_status === "supported").length,
      manual_review_source_count: sourceDiagnostics.filter((row) => row.capability_status === "manual_review_required").length,
      capability_status_counts: countBy(sourceDiagnostics, (row) => row.capability_status)
        .map(({ key, source_count }) => ({ capability_status: key, source_count })),
      primary_failure_code_counts: countBy(sourceDiagnostics, (row) => row.primary_failure_code)
        .map(({ key, source_count }) => ({ failure_code: key, source_count })),
      operational_code_counts: countBy(sourceDiagnostics.flatMap((row) => row.operational_codes), (code) => code)
        .map(({ key, source_count }) => ({ operational_code: key, source_count })),
      access_profile_counts: countBy(sourceDiagnostics.flatMap((row) => row.access_profiles), (profile) => profile)
        .map(({ key, source_count }) => ({ access_profile: key, source_count })),
      content_topology_profile_counts: countBy(sourceDiagnostics.flatMap((row) => row.content_topology_profiles), (profile) => profile)
        .map(({ key, source_count }) => ({ content_topology_profile: key, source_count })),
      candidate_detection_status_counts: countBy(
        sourceDiagnostics,
        (row) => row.candidate_detection_status,
      ).map(({ key, source_count }) => ({ candidate_detection_status: key, source_count })),
      action_class_counts: countBy(sourceDiagnostics, (row) => row.action_class)
        .map(({ key, source_count }) => ({ action_class: key, source_count })),
      evidence_basis_counts: countBy(sourceDiagnostics, (row) => row.evidence_basis)
        .map(({ key, source_count }) => ({ evidence_basis: key, source_count })),
    },
  };
}

/** Rebuilds only the additive action/evidence summary after authoritative injection. */
export function rebuildOperationalActionSummary(diagnostics = {}) {
  const rows = Array.isArray(diagnostics.source_diagnostics) ? diagnostics.source_diagnostics : [];
  return {
    ...diagnostics,
    summary: {
      ...(diagnostics.summary ?? {}),
      source_count: rows.length,
      action_class_counts: countBy(rows, (row) => row.action_class)
        .map(({ key, source_count }) => ({ action_class: key, source_count })),
      evidence_basis_counts: countBy(rows, (row) => row.evidence_basis)
        .map(({ key, source_count }) => ({ evidence_basis: key, source_count })),
    },
  };
}

export function validateOperationalCrawlDiagnostics(diagnostics) {
  const rows = Array.isArray(diagnostics?.source_diagnostics) ? diagnostics.source_diagnostics : [];
  const errors = [];
  const validCodes = new Set(Object.values(OPERATIONAL_CRAWL_CODES));
  const validProfiles = new Set(Object.values(OPERATIONAL_ACCESS_PROFILES));
  const validTopologyProfiles = new Set(Object.values(CONTENT_TOPOLOGY_PROFILES));
  if (count(diagnostics?.summary?.source_count) !== rows.length) errors.push("source_count_mismatch");
  const sourceIds = rows.map((row) => clean(row.source_id)).filter(Boolean);
  if (new Set(sourceIds).size !== sourceIds.length) errors.push("duplicate_source_id");
  const statusTotal = (diagnostics?.summary?.capability_status_counts ?? [])
    .reduce((sum, row) => sum + count(row?.source_count), 0);
  if (statusTotal !== rows.length) errors.push("capability_status_count_mismatch");
  const validateSummaryCounts = (rowsToValidate, field, validValues, errorPrefix) => {
    const values = Array.isArray(rowsToValidate) ? rowsToValidate : [];
    const labels = values.map((row) => clean(row?.[field]));
    if (new Set(labels).size !== labels.length) errors.push(`${errorPrefix}_duplicate`);
    if (labels.some((label) => !validValues.includes(label))) errors.push(`${errorPrefix}_unknown`);
    if (values.reduce((sum, row) => sum + count(row?.source_count), 0) !== rows.length) {
      errors.push(`${errorPrefix}_count_mismatch`);
    }
    const expected = new Map(countBy(rows, (row) => row?.[field]).map((row) => [row.key, row.source_count]));
    const actual = new Map(values.map((row) => [clean(row?.[field]), count(row?.source_count)]));
    if (expected.size !== actual.size || [...expected].some(([key, value]) => actual.get(key) !== value)) {
      errors.push(`${errorPrefix}_distribution_mismatch`);
    }
  };
  validateSummaryCounts(
    diagnostics?.summary?.action_class_counts,
    "action_class",
    OPERATIONAL_ACTION_CLASSES,
    "action_class_summary",
  );
  validateSummaryCounts(
    diagnostics?.summary?.evidence_basis_counts,
    "evidence_basis",
    OPERATIONAL_EVIDENCE_BASES,
    "evidence_basis_summary",
  );
  for (const row of rows) {
    if (!clean(row.source_id)) errors.push("missing_source_id");
    if (!OPERATIONAL_CAPABILITY_STATUSES.includes(row.capability_status)) errors.push("invalid_capability_status");
    if (!OPERATIONAL_ACTION_CLASSES.includes(row.action_class)) errors.push("invalid_action_class");
    if (!OPERATIONAL_EVIDENCE_BASES.includes(row.evidence_basis)) errors.push("invalid_evidence_basis");
    const verifiedSameHtmlNoAction = row.action_class === "no_action"
      && row.evidence_basis === "same_html_delta"
      && row.action_evidence?.verified_same_html_equivalence === true;
    const authoritativeTransportRecovery = row.action_class === "transport_recovery"
      && row.evidence_basis === "capture_transport_evidence"
      && ["transport_failure", "blocked_external"].includes(row.remediationEvidence?.capture_status);
    const allowedActionsByCapability = {
      adapter_required: ["configuration_review", "unresolved"],
      config_or_selector_fix: ["configuration_review", "source_url_review", "parser_remediation"],
      list_supported_detail_failed: ["unresolved", "transport_recovery"],
      manual_review_required: ["unresolved", "transport_recovery", "source_url_review"],
    };
    const allowedActions = allowedActionsByCapability[row.capability_status];
    if (allowedActions && !allowedActions.includes(row.action_class) && !verifiedSameHtmlNoAction && !authoritativeTransportRecovery) {
      errors.push("invalid_capability_action_combination");
    }
    if (row.action_class === "no_action"
      && !["supported", "posts_found_no_scholarship", "no_posts_detected", "valid_zero_candidates"].includes(row.capability_status)
      && !verifiedSameHtmlNoAction && !authoritativeTransportRecovery) {
      errors.push("invalid_capability_action_combination");
    }
    if (typeof row.analysis_valid !== "boolean") errors.push("invalid_analysis_valid");
    if (!PHASE2_REMEDIATION_STATUSES.includes(row.phase2_status)) errors.push("invalid_phase2_status");
    if (!Array.isArray(row.analysis_codes)
      || row.analysis_codes.some((code) => !Object.values(PHASE2_ANALYSIS_CODES).includes(code))) {
      errors.push("invalid_phase2_analysis_codes");
    }
    if (!PHASE2_LIST_PARSER_CONTRACT_STATUSES.includes(row.list_parser_contract_status)) errors.push("invalid_list_parser_contract_status");
    if (!PHASE2_CANDIDATE_RECALL_STATUSES.includes(row.candidate_recall_status)) errors.push("invalid_candidate_recall_status");
    if (!PHASE2_DETAIL_IDENTITY_STATUSES.includes(row.detail_identity_status)) errors.push("invalid_detail_identity_status");
    if (!PHASE2_PAGINATION_STATUSES.includes(row.pagination_status)) errors.push("invalid_pagination_status");
    if (!PHASE2_RUNTIME_ACCESSIBILITY_STATUSES.includes(row.runtime_accessibility_status)) errors.push("invalid_runtime_accessibility_status");
    if (row.analysis_valid === false && ["verified_heuristic_safe", "parser_profile_applied", "configured_selector_applied"].includes(row.phase2_status)) {
      errors.push("invalid_analysis_success_terminal");
    }
    if (!Array.isArray(row.operational_codes) || row.operational_codes.some((code) => !validCodes.has(code))) {
      errors.push("invalid_operational_codes");
    }
    if (row.primary_failure_code && !row.operational_codes.includes(row.primary_failure_code)) {
      errors.push("primary_failure_code_not_in_operational_codes");
    }
    if (!Array.isArray(row.access_profiles) || row.access_profiles.some((profile) => !validProfiles.has(profile))) {
      errors.push("invalid_access_profiles");
    }
    if (!Array.isArray(row.content_topology_profiles)
      || row.content_topology_profiles.some((profile) => !validTopologyProfiles.has(profile))) {
      errors.push("invalid_content_topology_profiles");
    }
    if (!Array.isArray(row.stage_entries) || row.stage_entries.length !== OPERATIONAL_CRAWL_STAGES.length) {
      errors.push("stage_entries_incomplete");
    } else if (row.stage_entries.some((entry, index) => entry.stage !== OPERATIONAL_CRAWL_STAGES[index]
      || !OPERATIONAL_STAGE_STATUSES.includes(entry.status))) {
      errors.push("invalid_stage_entry");
    }
    for (const field of ["title_extract_rate", "date_extract_rate", "detail_url_resolution_rate"]) {
      const value = row.metrics?.[field];
      if (value !== null && value !== undefined && (Number(value) < 0 || Number(value) > 1)) errors.push("rate_out_of_range");
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)].sort() };
}

function escapeCsvCell(value) {
  const text = clean(Array.isArray(value) ? value.join("|") : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stageValue(row, stage) {
  return row.stage_entries?.find((entry) => entry.stage === stage)?.status ?? "not_observed";
}

export function buildOperationalCrawlDiagnosticsCsv(diagnostics = {}) {
  const rows = Array.isArray(diagnostics.source_diagnostics) ? diagnostics.source_diagnostics : [];
  const body = rows.map((row) => [
    row.source_id,
    row.source_name,
    row.university_slug,
    row.source_level,
    row.adapter,
    row.metrics?.parser_strategy,
    row.metrics?.list_parser_profile,
    row.metrics?.profile_applied,
    row.metrics?.parser_fallback_recovered,
    stageValue(row, "list_fetch"),
    stageValue(row, "list_decode"),
    stageValue(row, "list_parse"),
    stageValue(row, "notice_url_resolution"),
    stageValue(row, "pagination_check"),
    stageValue(row, "detail_fetch"),
    stageValue(row, "detail_content_extract"),
    stageValue(row, "candidate_filter"),
    row.metrics?.list_candidate_count,
    row.metrics?.title_extract_rate,
    row.metrics?.date_extract_rate,
    row.metrics?.detail_url_resolution_rate,
    row.metrics?.detail_url_verified_count,
    row.metrics?.detail_fetch_success_count,
    row.metrics?.detail_fetch_failure_count,
    row.metrics?.detail_identity_verified_count,
    row.metrics?.detail_identity_unverified_count,
    row.metrics?.detail_content_empty_count,
    row.metrics?.raw_navigation_count,
    row.metrics?.contaminated_candidate_count,
    row.metrics?.contaminated_candidate_leak_count,
    row.metrics?.candidate_navigation_leak_count,
    row.metrics?.navigation_url_overlap_count,
    row.metrics?.filtered_navigation_anchor_count,
    row.metrics?.filtered_pagination_anchor_count,
    row.metrics?.observed_count,
    row.metrics?.keyword_match_count,
    row.metrics?.date_match_count,
    row.metrics?.matched_count,
    row.capability_status,
    row.action_class,
    row.evidence_basis,
    row.primary_failure_code,
    row.operational_codes,
    row.access_profiles,
    row.recommended_action,
    row.manual_review_question,
    row.evidence_summary,
    row.runtime_result_status,
    row.content_topology_profiles,
    row.parser_evidence?.content_mode_declared,
    row.metrics?.heading_candidate_count,
    row.metrics?.heading_with_body_count,
    row.metrics?.heading_notice_signal_count,
    row.metrics?.inline_notice_section_count,
    row.metrics?.inline_body_char_count,
    row.metrics?.same_origin_link_count,
    row.metrics?.cross_origin_link_count,
    row.metrics?.cross_origin_link_rate,
    row.metrics?.independent_detail_url_count,
    row.metrics?.external_resource_link_count,
    row.metrics?.attachment_link_count,
    row.parser_evidence?.list_page_contains_candidate_body,
    row.metrics?.detail_like_same_origin_link_count,
    row.metrics?.same_origin_navigation_link_count,
    row.metrics?.same_origin_unknown_link_count,
    row.metrics?.cross_origin_authoritative_detail_link_count,
    row.metrics?.application_form_link_count,
    row.metrics?.supporting_reference_link_count,
    row.metrics?.unknown_external_link_count,
    row.adapter_evidence?.adapter_capability_verified,
    row.adapter_evidence?.adapter_extracted_notice_count,
    row.adapter_evidence?.detail_fetch_required,
    row.adapter_evidence?.detail_content_already_available,
    row.metrics?.inline_section_identity_count,
    row.metrics?.inline_section_identity_unique_count,
    row.metrics?.inline_section_identity_collision_count,
    row.metrics?.checkpoint_work_item_unique_count,
    row.metrics?.published_date_count,
    row.metrics?.undated_notice_count,
    row.metrics?.weak_identity_count,
  ].map(escapeCsvCell).join(","));
  return `\uFEFF${[OPERATIONAL_CRAWL_DIAGNOSTIC_CSV_COLUMNS.join(","), ...body].join("\r\n")}`;
}
