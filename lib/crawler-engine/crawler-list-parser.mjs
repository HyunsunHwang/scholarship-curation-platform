import { load as loadHtml } from "cheerio";
import { extractNoticeUrlFromLinkNode } from "../crawler-adapters/index.mjs";
import {
  OPERATIONAL_COMMON_LIST_SELECTORS,
  OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR,
  attachOperationalListParserEvidence,
  classifyOperationalLinkRole,
  collectOperationalListParserEvidence,
} from "./operational-parser-evidence.mjs";

const DEFAULT_NOTICE_URL_PATTERN =
  /(mode=view|sMode=VIEW_FORM|iBrdContNo=|articleNo=|boardNo=|nttNo=|idx=\d+|no=\d+|wr_id=\d+|boardSeq=\d+|b_idx=\d+|seq=\d+|uid=\d+|artclView\.do|notice-view\?id=|mod=document)/i;

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrlKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    let pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (/\/index\.(html?|php|jsp|asp|aspx|do)$/i.test(pathname)) {
      pathname = pathname.replace(/\/index\.(html?|php|jsp|asp|aspx|do)$/i, "") || "/";
    }
    url.pathname = pathname;
    return url.href;
  } catch {
    return cleanText(value).replace(/\/+$/, "");
  }
}

function isLikelyNonDetailNoticeUrl(noticeUrl, listUrl, baseUrl) {
  try {
    const notice = new URL(noticeUrl);
    const noticeKey = normalizeUrlKey(noticeUrl);
    if (listUrl && noticeKey === normalizeUrlKey(listUrl)) return true;
    if (baseUrl && noticeKey === normalizeUrlKey(baseUrl)) return true;

    if (DEFAULT_NOTICE_URL_PATTERN.test(`${notice.pathname}${notice.search}`)) {
      return false;
    }

    const pathName = notice.pathname.toLowerCase();
    if (pathName === "/" || pathName === "") return true;
    if (/\/(index|main|home|sitemap)(\.(html?|php|jsp|asp|aspx|do))?$/i.test(pathName)) {
      return true;
    }
    if (/\/(sitemap|login|member|intro|about)(\/|$)/i.test(pathName)) return true;
    return false;
  } catch {
    return false;
  }
}

function extractDateLikeText(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";
  const patterns = [
    /(\d{4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2})/,
    /(\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)/,
    /(\d{2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2})/,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return cleanText(match[1]);
  }
  return "";
}

function extractListDateText(itemRoot, dateSelector) {
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (value) => {
    const text = cleanText(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    candidates.push(text);
  };

  if (dateSelector) {
    itemRoot.find(dateSelector).each((_, node) => {
      pushCandidate(itemRoot.find(node).text());
    });
  }
  itemRoot.find("time, td, span, div").each((index, node) => {
    if (index > 40) return false;
    pushCandidate(itemRoot.find(node).text());
    return undefined;
  });
  for (const candidate of candidates) {
    const dateLike = extractDateLikeText(candidate);
    if (dateLike) return dateLike;
  }
  return "";
}

export function extractFromList(source, html) {
  const $ = loadHtml(html);
  const results = [];
  const seen = new Set();
  const sourceId = cleanText(source.sourceId).toLowerCase();
  const finalize = (items = results) => attachOperationalListParserEvidence(
    items,
    collectOperationalListParserEvidence(source, html, items),
  );

  const addBoardItem = (link, title, dateText, noticeUrlOverride = "") => {
    const noticeUrl = noticeUrlOverride || extractNoticeUrlFromLinkNode(source, link);
    const normalizedTitle = cleanText(title);
    if (!noticeUrl || !normalizedTitle || seen.has(noticeUrl)) return;
    seen.add(noticeUrl);
    results.push({
      sourceId: source.sourceId,
      universitySlug: source.universitySlug,
      universityId: source.universityId,
      collegeId: source.collegeId,
      departmentId: source.departmentId,
      collegeName: source.collegeName,
      departmentName: source.departmentName,
      sourceLevel: source.sourceLevel,
      sourceName: source.sourceName,
      listUrl: source.listUrl,
      noticeUrl,
      title: normalizedTitle,
      dateText: cleanText(dateText),
    });
  };

  if (sourceId === "cau_001") {
    $("tr").each((_, node) => {
      const row = $(node);
      const link = row.find('a[href*="sub06_01_view.php"][href*="bbsIdx="]').first();
      if (!link.length) return;
      const noticeUrl = extractNoticeUrlFromLinkNode(source, link);
      const title = cleanText(link.text());
      if (!noticeUrl || !title || seen.has(noticeUrl)) return;
      seen.add(noticeUrl);
      results.push({
        sourceId: source.sourceId,
        universitySlug: source.universitySlug,
        universityId: source.universityId,
        collegeId: source.collegeId,
        departmentId: source.departmentId,
        collegeName: source.collegeName,
        departmentName: source.departmentName,
        sourceLevel: source.sourceLevel,
        sourceName: source.sourceName,
        listUrl: source.listUrl,
        noticeUrl,
        title,
        dateText: extractListDateText(row, source.dateSelector),
      });
    });
    return finalize();
  }

  if (sourceId === "cau_003") {
    $("table.board-table tbody tr").each((_, node) => {
      const row = $(node);
      const link = row.find("a.board-page-link").first();
      const articleId = cleanText(link.attr("href")).match(
        /javascript:view\(\s*['"](\d+)['"]/i,
      )?.[1];
      if (!articleId) return;
      const target = new URL(source.listUrl);
      target.search = "";
      target.searchParams.set("p_idx", articleId);
      target.searchParams.set("p_mode", "view");
      addBoardItem(
        link,
        link.text(),
        row.find(".board-col--mb .date").first().text() || row.find("td").last().text(),
        target.toString(),
      );
    });
    return finalize();
  }

  if (sourceId === "cau_007") {
    $("ul.board_list > li").each((_, node) => {
      const row = $(node);
      const link = row.find('a[href*="seq="]').first();
      addBoardItem(
        link,
        row.find(".board_list_tit").first().text(),
        row.find(".board_list_info .line").last().text(),
      );
    });
    return finalize();
  }

  if (sourceId === "cau_008") {
    $(".bbs-list-row").each((_, node) => {
      const row = $(node);
      const link = row.find('a[href*="bgu=view"][href*="idx="]').first();
      addBoardItem(
        link,
        row.find(".bbs-subject-txt").first().text(),
        row.find(".bbs-inline").eq(1).text(),
      );
    });
    return finalize();
  }

  const pushResult = (node, index) => {
    const itemRoot = node ? $(node) : null;
    const linkNode = itemRoot
      ? source.linkSelector
        ? itemRoot.find(source.linkSelector).first()
        : itemRoot.find("a[href]").first()
      : null;
    const fallbackLinkNode = !itemRoot
      ? $("a[href], a[onclick], a[data-href], a[data-url], a[data-link]").eq(index)
      : null;
    const activeLinkNode = linkNode && linkNode.length ? linkNode : fallbackLinkNode;

    if (activeLinkNode?.closest(OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR).length) return;
    if (itemRoot?.closest(OPERATIONAL_NAVIGATION_CONTAINER_SELECTOR).length) return;

    const noticeUrl = extractNoticeUrlFromLinkNode(source, activeLinkNode);
    if (!noticeUrl || seen.has(noticeUrl)) return;
    const linkRole = classifyOperationalLinkRole({
      href: noticeUrl,
      text: activeLinkNode?.text(),
      source,
    });
    // Preserve the mature generic parser's existing URL behavior. An explicit
    // inline-section contract is the one topology where resource links must
    // never become detail candidates; otherwise link roles remain diagnostic
    // evidence until a source-specific/verified adapter owns extraction.
    if (source.contentMode === "inline_sections"
      && !["same_origin_detail", "cross_origin_authoritative_detail"].includes(linkRole)) return;

    const titleRaw = itemRoot
      ? source.titleSelector
        ? itemRoot.find(source.titleSelector).first().text()
        : activeLinkNode?.text() ?? itemRoot.text()
      : activeLinkNode?.text() ?? "";
    const title = cleanText(titleRaw);
    if (!title) return;
    if (isLikelyNonDetailNoticeUrl(noticeUrl, source.listUrl, source.baseUrl)) return;

    const dateText = itemRoot ? extractListDateText(itemRoot, source.dateSelector) : "";
    seen.add(noticeUrl);
    results.push({
      sourceId: source.sourceId,
      universitySlug: source.universitySlug,
      universityId: source.universityId,
      collegeId: source.collegeId,
      departmentId: source.departmentId,
      collegeName: source.collegeName,
      departmentName: source.departmentName,
      sourceLevel: source.sourceLevel,
      sourceName: source.sourceName,
      listUrl: source.listUrl,
      noticeUrl,
      title,
      dateText,
    });
  };

  if (source.listItemSelector) {
    $(source.listItemSelector).each((index, node) => pushResult(node, index));
  } else {
    const commonSelector = OPERATIONAL_COMMON_LIST_SELECTORS.find(
      (selector) => $(selector).length > 0,
    );
    if (commonSelector) {
      $(commonSelector).each((index, node) => pushResult(node, index));
    } else {
      $("a[href], a[onclick], a[data-href], a[data-url], a[data-link]").each(
        (index) => pushResult(null, index),
      );
    }
  }

  if (source.noticeUrlPattern) {
    const pattern = new RegExp(source.noticeUrlPattern);
    return finalize(results.filter((item) => pattern.test(item.noticeUrl)));
  }
  if (source.listItemSelector) {
    const patterned = results.filter((item) => DEFAULT_NOTICE_URL_PATTERN.test(item.noticeUrl));
    if (patterned.length > 0) return finalize(patterned);
  }
  return finalize();
}
