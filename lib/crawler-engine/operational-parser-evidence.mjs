import { load as loadHtml } from "cheerio";

export const OPERATIONAL_COMMON_LIST_SELECTORS = Object.freeze([
  ".board-list-wrap > li",
]);

export const OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR = [
  "header",
  "nav",
  "footer",
  "aside",
  "[role='navigation']",
  ".breadcrumb",
  ".breadcrumbs",
  ".category-tab",
  ".category-tabs",
  ".board-search",
  ".search-tab",
  ".gnb",
  ".lnb",
  ".snb",
  ".menu",
  ".quick-menu",
].join(",");

const PAGINATION_SELECTOR = [
  ".pagination",
  ".paging",
  ".paginate",
  ".page-navigation",
  "nav[aria-label*='page' i]",
  "a[href*='page=']",
  "a[href*='pageNo=']",
  "a[href*='pageIndex=']",
].join(",");

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveHttpUrl(value, source) {
  const input = clean(value);
  if (!input || /^(?:javascript:|#)/i.test(input)) return "";
  try {
    const url = new URL(input, source.listUrl || source.baseUrl);
    url.hash = "";
    return isHttpUrl(url.toString()) ? url.toString() : "";
  } catch {
    return "";
  }
}

function samePageUrl(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    a.hash = "";
    b.hash = "";
    return a.toString() === b.toString();
  } catch {
    return false;
  }
}

function sumObserved(evidenceRows, field) {
  const values = evidenceRows.map((row) => row?.[field]).filter((value) => Number.isFinite(Number(value)));
  return values.length > 0 ? values.reduce((sum, value) => sum + Number(value), 0) : null;
}

function sortedUnique(values) {
  return [...new Set(values.map(clean).filter(Boolean))].sort();
}

/** Collects evidence from one already-fetched list page without making requests. */
export function collectOperationalListParserEvidence(source = {}, html = "", parsedItems = []) {
  const $ = loadHtml(String(html ?? ""));
  const configuredSelector = clean(source.listItemSelector);
  const commonSelector = configuredSelector
    ? ""
    : OPERATIONAL_COMMON_LIST_SELECTORS.find((selector) => $(selector).length > 0) ?? "";
  const matchedSelector = configuredSelector || commonSelector;
  const parserStrategy = configuredSelector
    ? "configured_selector"
    : commonSelector
      ? "common_board_selector"
      : "heuristic_anchor";
  const items = Array.isArray(parsedItems) ? parsedItems : [];
  const allAnchors = $("a[href], a[onclick], a[data-href], a[data-url], a[data-link]");
  const navigationAnchors = $(OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR)
    .find("a[href], a[onclick], a[data-href], a[data-url], a[data-link]");
  const contaminatedUrls = new Set();
  const contaminatedNodes = new Set();
  navigationAnchors.each((_, node) => contaminatedNodes.add(node));
  allAnchors.each((_, node) => {
    const anchor = $(node);
    const resolved = resolveHttpUrl(
      anchor.attr("href") || anchor.attr("data-href") || anchor.attr("data-url") || anchor.attr("data-link"),
      source,
    );
    const href = clean(anchor.attr("href"));
    const placeholderWithoutEvidence = (!href || /^(?:#|javascript:)/i.test(href))
      && !clean(anchor.attr("onclick"))
      && !clean(anchor.attr("data-href") || anchor.attr("data-url") || anchor.attr("data-link"));
    if (placeholderWithoutEvidence || (resolved && samePageUrl(resolved, source.listUrl))) {
      contaminatedNodes.add(node);
    }
    if (contaminatedNodes.has(node) && resolved) contaminatedUrls.add(resolved);
  });
  const contaminatedLeakCount = items.filter((item) => {
    const resolved = resolveHttpUrl(item?.noticeUrl, source);
    return resolved && [...contaminatedUrls].some((value) => samePageUrl(value, resolved));
  }).length;
  const eventUrlEvidenceCount = allAnchors.filter((_, node) => {
    const anchor = $(node);
    return Boolean(clean(anchor.attr("onclick") || anchor.attr("data-href") || anchor.attr("data-url") || anchor.attr("data-link")));
  }).length;
  const manualNetworkEvidenceRequiredCount = allAnchors.filter((_, node) => {
    const anchor = $(node);
    const href = clean(anchor.attr("href"));
    return (!href || /^(?:#|javascript:)/i.test(href))
      && Boolean(clean(anchor.attr("onclick")))
      && !/https?:|\/|(?:articleNo|boardNo|nttNo|idx|no|wr_id|b_idx|seq|uid)\D*\d+/i.test(clean(anchor.attr("onclick")));
  }).length;
  const charset = clean($("meta[charset]").first().attr("charset")
    || clean($("meta[http-equiv='content-type' i]").first().attr("content")).match(/charset\s*=\s*([^;\s]+)/i)?.[1]);
  const paginationEvidenceCount = $(PAGINATION_SELECTOR).length;
  const fallbackUsed = !configuredSelector;

  return Object.freeze({
    page_count: 1,
    parser_strategy: parserStrategy,
    parser_strategies: [parserStrategy],
    configured_list_selector: configuredSelector || null,
    matched_list_selector: matchedSelector || null,
    matched_list_selectors: matchedSelector ? [matchedSelector] : [],
    selector_match_count: matchedSelector ? $(matchedSelector).length : null,
    list_candidate_count: items.length,
    parsed_candidate_count: items.length,
    title_extract_count: items.filter((item) => clean(item?.title)).length,
    date_extract_count: items.filter((item) => clean(item?.dateText ?? item?.detailDate)).length,
    resolved_detail_url_count: items.filter((item) => clean(item?.noticeUrl)).length,
    valid_detail_url_count: items.filter((item) => isHttpUrl(item?.noticeUrl)).length,
    raw_navigation_count: navigationAnchors.length,
    navigation_anchor_count: navigationAnchors.length,
    contaminated_candidate_count: contaminatedNodes.size,
    contaminated_candidate_leak_count: contaminatedLeakCount,
    pagination_evidence_count: paginationEvidenceCount,
    pagination_verified: paginationEvidenceCount > 0 ? false : null,
    parser_fallback_used: fallbackUsed,
    fallback_scan_used: parserStrategy === "heuristic_anchor",
    parser_fallback_recovered: fallbackUsed && items.length > 0,
    event_url_evidence_count: eventUrlEvidenceCount,
    manual_network_evidence_required_count: manualNetworkEvidenceRequiredCount,
    response_charset: charset || null,
    client_rendered_marker_detected: /__NEXT_DATA__|<div[^>]+id=["'](?:root|app)["']|ng-app|data-v-app/i.test(String(html ?? "")),
  });
}

/** Deterministically aggregates all fetched list-page evidence for one source. */
export function aggregateOperationalListParserEvidence(evidenceRows = []) {
  const rows = (Array.isArray(evidenceRows) ? evidenceRows : []).filter(Boolean);
  if (rows.length === 0) return null;
  const parserStrategies = sortedUnique(rows.flatMap((row) => row.parser_strategies ?? [row.parser_strategy]));
  const matchedSelectors = sortedUnique(rows.flatMap((row) => row.matched_list_selectors ?? [row.matched_list_selector]));
  const configuredSelectors = sortedUnique(rows.map((row) => row.configured_list_selector));
  const paginationEvidenceCount = sumObserved(rows, "pagination_evidence_count");
  const pageCount = rows.length;
  return Object.freeze({
    page_count: pageCount,
    parser_strategy: parserStrategies.length === 1 ? parserStrategies[0] : "mixed",
    parser_strategies: parserStrategies,
    configured_list_selector: configuredSelectors[0] ?? null,
    matched_list_selector: matchedSelectors.length === 1 ? matchedSelectors[0] : null,
    matched_list_selectors: matchedSelectors,
    selector_match_count: sumObserved(rows, "selector_match_count"),
    list_candidate_count: sumObserved(rows, "list_candidate_count"),
    parsed_candidate_count: sumObserved(rows, "parsed_candidate_count"),
    title_extract_count: sumObserved(rows, "title_extract_count"),
    date_extract_count: sumObserved(rows, "date_extract_count"),
    resolved_detail_url_count: sumObserved(rows, "resolved_detail_url_count"),
    valid_detail_url_count: sumObserved(rows, "valid_detail_url_count"),
    raw_navigation_count: sumObserved(rows, "raw_navigation_count"),
    navigation_anchor_count: sumObserved(rows, "navigation_anchor_count"),
    contaminated_candidate_count: sumObserved(rows, "contaminated_candidate_count"),
    contaminated_candidate_leak_count: sumObserved(rows, "contaminated_candidate_leak_count"),
    pagination_evidence_count: paginationEvidenceCount,
    pagination_verified: Number(paginationEvidenceCount) > 0 ? pageCount > 1 : null,
    parser_fallback_used: rows.some((row) => row.parser_fallback_used === true),
    fallback_scan_used: rows.some((row) => row.fallback_scan_used === true),
    parser_fallback_recovered: rows.some((row) => row.parser_fallback_recovered === true),
    event_url_evidence_count: sumObserved(rows, "event_url_evidence_count"),
    manual_network_evidence_required_count: sumObserved(rows, "manual_network_evidence_required_count"),
    response_charset: sortedUnique(rows.map((row) => row.response_charset))[0] ?? null,
    client_rendered_marker_detected: rows.some((row) => row.client_rendered_marker_detected === true),
  });
}

export function attachOperationalListParserEvidence(items, evidence) {
  if (!Array.isArray(items)) return items;
  Object.defineProperty(items, "operational_parser_evidence", {
    value: evidence ?? null,
    enumerable: false,
    configurable: true,
  });
  return items;
}
