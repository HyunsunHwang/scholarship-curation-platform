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

const EMPTY_STATE_SELECTOR = [
  ".empty",
  ".empty-state",
  ".no-data",
  ".no-results",
  ".board-empty",
  ".list-empty",
  ".notice-empty",
  "tr.empty",
  "li.empty",
  "[data-empty-state='true']",
  ".board-list",
  ".notice-list",
  ".board-list-wrap",
  "table tbody",
].join(",");

const EMPTY_STATE_PATTERN = /(?:등록된\s*(?:게시물|글)이\s*없습니다|게시물이\s*없습니다|등록된\s*글이\s*없습니다|검색\s*결과가\s*없습니다|조회된\s*게시물이\s*없습니다|no\s+(?:posts|data|results))/iu;

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

const EXTERNAL_RESOURCE_HOSTS = /(?:drive\.google\.com|docs\.google\.com|forms\.gle|form\.office\.com|dropbox\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|kakao\.com)/i;
const ATTACHMENT_EXTENSION = /\.(?:pdf|hwp|hwpx|docx?|xlsx?|pptx?|zip)(?:$|[?#])/i;
const APPLICATION_TEXT = /(?:apply|application|\uc2e0\uccad|\uc811\uc218|\uc9c0\uc6d0\uc11c)/i;

export const CONTENT_TOPOLOGY_PROFILES = Object.freeze({
  LIST_DETAIL_PAGES: "LIST_DETAIL_PAGES",
  INLINE_MULTI_NOTICE_PAGE: "INLINE_MULTI_NOTICE_PAGE",
  LIST_PAGE_CONTAINS_AUTHORITATIVE_DETAIL: "LIST_PAGE_CONTAINS_AUTHORITATIVE_DETAIL",
  EXTERNAL_LINKS_ARE_SUPPORTING_RESOURCES: "EXTERNAL_LINKS_ARE_SUPPORTING_RESOURCES",
  UNKNOWN_CONTENT_TOPOLOGY: "UNKNOWN_CONTENT_TOPOLOGY",
});

/** Classifies an already-observed link; it never performs a network request. */
export function classifyOperationalLinkRole({ href = "", text = "", source = {} } = {}) {
  const resolved = resolveHttpUrl(href, source);
  if (!resolved) return "navigation";
  const label = clean(text);
  let url;
  try { url = new URL(resolved); } catch { return "unknown_external"; }
  const sourceHost = new URL(source.listUrl || source.baseUrl).hostname.toLowerCase();
  const sameOrigin = url.hostname.toLowerCase() === sourceHost;
  if (/^(?:mailto:|tel:)/i.test(clean(href))) return "supporting_reference";
  if (ATTACHMENT_EXTENSION.test(url.pathname) || /(?:attachment|download|\ucca8\ubd80)/i.test(label)) return "attachment";
  if (APPLICATION_TEXT.test(`${label} ${url.pathname}`) || /(?:forms\.gle|form\.office\.com)/i.test(url.hostname)) return "application_form";
  if (!sameOrigin && EXTERNAL_RESOURCE_HOSTS.test(url.hostname)) return "supporting_reference";
  if (!sameOrigin && /(?:notice|announcement|board|article|post|detail|\uacf5\uc9c0|\uac8c\uc2dc)/i.test(`${label} ${url.pathname}`)) {
    return "cross_origin_authoritative_detail";
  }
  if (!sameOrigin) return "unknown_external";
  if (samePageUrl(resolved, source.listUrl) || /(?:^|\/)(?:index|main|home)(?:\.|\/|$)/i.test(url.pathname)) return "navigation";
  if (/(?:view|detail|notice|board|article|post|read|uid=|seq=|articleNo=|boardNo=|nttNo=|wr_id=|idx=|no=)/i.test(`${url.pathname}${url.search}`)) return "same_origin_detail";
  return "same_origin_detail";
}

function headingBodyEvidence($, node) {
  let body = "";
  let cursor = $(node).next();
  let steps = 0;
  while (cursor.length && steps < 80) {
    if (/^h[1-6]$/i.test(cursor[0]?.tagName ?? "")) break;
    if (!cursor.closest(OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR).length) body += ` ${clean(cursor.text())}`;
    cursor = cursor.next();
    steps += 1;
  }
  return clean(body);
}

function collectContentTopologyEvidence($, source, allAnchors) {
  const headings = $("h1,h2,h3,h4,h5,h6").toArray()
    .filter((node) => !$(node).closest(OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR).length)
    .map((node) => ({ title: clean($(node).text()), body: headingBodyEvidence($, node) }))
    .filter((section) => section.title.length >= 4);
  const substantive = headings.filter((section) => section.body.length >= 40);
  const roles = { same_origin_detail: 0, cross_origin_authoritative_detail: 0, attachment: 0, application_form: 0, supporting_reference: 0, navigation: 0, unknown_external: 0 };
  allAnchors.each((_, node) => {
    if ($(node).closest(OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR).length) return;
    const role = classifyOperationalLinkRole({ href: $(node).attr("href"), text: $(node).text(), source });
    roles[role] += 1;
  });
  const sameOriginLinkCount = roles.same_origin_detail;
  const crossOriginLinkCount = roles.cross_origin_authoritative_detail + roles.attachment + roles.application_form + roles.supporting_reference + roles.unknown_external;
  const externalResourceLinkCount = roles.attachment + roles.application_form + roles.supporting_reference;
  const independentDetailUrlCount = sameOriginLinkCount + roles.cross_origin_authoritative_detail;
  const inlineBodyCharCount = substantive.reduce((sum, section) => sum + section.body.length, 0);
  // Require repeated title/body sections, substantial prose, and no independent
  // detail model. This intentionally does not infer inline mode from headings alone.
  const inlineDetected = substantive.length >= 2
    && inlineBodyCharCount >= 160
    && independentDetailUrlCount === 0
    && externalResourceLinkCount >= 1;
  return {
    heading_candidate_count: headings.length,
    heading_with_body_count: substantive.length,
    inline_notice_section_count: inlineDetected ? substantive.length : 0,
    inline_body_char_count: inlineBodyCharCount,
    same_origin_link_count: sameOriginLinkCount,
    cross_origin_link_count: crossOriginLinkCount,
    cross_origin_link_rate: sameOriginLinkCount + crossOriginLinkCount > 0
      ? crossOriginLinkCount / (sameOriginLinkCount + crossOriginLinkCount) : 0,
    detail_like_same_origin_link_count: sameOriginLinkCount,
    external_resource_link_count: externalResourceLinkCount,
    attachment_link_count: roles.attachment,
    list_page_contains_candidate_body: inlineDetected,
    independent_detail_url_count: independentDetailUrlCount,
    content_mode_declared: clean(source.contentMode) || null,
  };
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
  const emptyStateEvidence = $(EMPTY_STATE_SELECTOR)
    .toArray()
    .map((node) => clean($(node).text()))
    .find((text) => EMPTY_STATE_PATTERN.test(text)) ?? "";
  const fallbackUsed = !configuredSelector;
  const topology = collectContentTopologyEvidence($, source, allAnchors);

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
    explicit_empty_state_detected: Boolean(emptyStateEvidence),
    empty_state_evidence: emptyStateEvidence || null,
    response_charset: charset || null,
    client_rendered_marker_detected: /__NEXT_DATA__|<div[^>]+id=["'](?:root|app)["']|ng-app|data-v-app/i.test(String(html ?? "")),
    ...topology,
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
    explicit_empty_state_detected: rows.some((row) => row.explicit_empty_state_detected === true),
    empty_state_evidence: sortedUnique(rows.map((row) => row.empty_state_evidence))[0] ?? null,
    response_charset: sortedUnique(rows.map((row) => row.response_charset))[0] ?? null,
    client_rendered_marker_detected: rows.some((row) => row.client_rendered_marker_detected === true),
    heading_candidate_count: sumObserved(rows, "heading_candidate_count"),
    heading_with_body_count: sumObserved(rows, "heading_with_body_count"),
    inline_notice_section_count: sumObserved(rows, "inline_notice_section_count"),
    inline_body_char_count: sumObserved(rows, "inline_body_char_count"),
    same_origin_link_count: sumObserved(rows, "same_origin_link_count"),
    cross_origin_link_count: sumObserved(rows, "cross_origin_link_count"),
    cross_origin_link_rate: (() => {
      const same = sumObserved(rows, "same_origin_link_count") ?? 0;
      const cross = sumObserved(rows, "cross_origin_link_count") ?? 0;
      return same + cross > 0 ? cross / (same + cross) : 0;
    })(),
    detail_like_same_origin_link_count: sumObserved(rows, "detail_like_same_origin_link_count"),
    external_resource_link_count: sumObserved(rows, "external_resource_link_count"),
    attachment_link_count: sumObserved(rows, "attachment_link_count"),
    list_page_contains_candidate_body: rows.some((row) => row.list_page_contains_candidate_body === true),
    independent_detail_url_count: sumObserved(rows, "independent_detail_url_count"),
    content_mode_declared: sortedUnique(rows.map((row) => row.content_mode_declared))[0] ?? null,
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
