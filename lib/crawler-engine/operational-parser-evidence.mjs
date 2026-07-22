import { load as loadHtml } from "cheerio";

export const OPERATIONAL_COMMON_LIST_SELECTORS = Object.freeze([
  ".board-list-wrap > li",
]);

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

/**
 * Collects parser-only evidence from the already fetched list HTML. It makes no
 * requests and does not alter the list candidates selected by the crawler.
 */
export function collectOperationalListParserEvidence(source = {}, html = "", parsedItems = []) {
  const $ = loadHtml(String(html ?? ""));
  const configuredSelector = clean(source.listItemSelector);
  const commonSelector = OPERATIONAL_COMMON_LIST_SELECTORS.find((selector) => $(selector).length > 0) ?? "";
  const selector = configuredSelector || commonSelector;
  const items = Array.isArray(parsedItems) ? parsedItems : [];
  const navigationAnchorCount = $("header a[href], nav a[href], footer a[href], aside a[href]").length;
  const paginationEvidenceCount = $(
    ".pagination, .paging, .paginate, .page-navigation, a[href*='page='], a[href*='pageNo='], a[href*='pageIndex=']",
  ).length;
  return Object.freeze({
    parser_strategy: configuredSelector
      ? "configured_selector"
      : commonSelector
        ? "common_board_selector"
        : "heuristic_anchor",
    configured_list_selector: configuredSelector || null,
    matched_list_selector: selector || null,
    selector_match_count: selector ? $(selector).length : null,
    parsed_candidate_count: items.length,
    title_extract_count: items.filter((item) => clean(item?.title)).length,
    resolved_detail_url_count: items.filter((item) => clean(item?.noticeUrl)).length,
    valid_detail_url_count: items.filter((item) => isHttpUrl(item?.noticeUrl)).length,
    navigation_anchor_count: navigationAnchorCount,
    pagination_evidence_count: paginationEvidenceCount,
    fallback_scan_used: !configuredSelector && !commonSelector,
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
