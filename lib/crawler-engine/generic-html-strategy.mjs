import { load as loadHtml } from "cheerio";
import { canonicalizeNoticeUrl } from "../post-phase-l/normalized-graph.mjs";
import { extractDetailFromCheerio } from "../notice-body-extraction.mjs";
import { verifyOperationalDetailTitleIdentity } from "./runtime-diagnostics/operational-title-identity.mjs";

const DETAIL_TITLE_SELECTORS = Object.freeze([
  ".bbs-view > header.top h2.t",
  ".bbs-view header.top h2.t",
  ".board-view-title-wrap h4",
  ".board-view-title-wrap h3",
  ".board-view-title",
  ".board-view-tit",
  ".board_view_title",
  ".view-title",
  ".view_title",
  ".board-title",
  ".board_title",
  ".bbs-title",
  "#bo_v_title",
  ".subject",
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function createGenericHtmlStrategy({ parseListHtml }) {
  if (typeof parseListHtml !== "function") {
    throw new Error("generic_html requires parseListHtml");
  }
  return Object.freeze({
    name: "generic_html",
    buildListRequest({ listUrl }) {
      return { url: new URL(listUrl).toString(), kind: "list" };
    },
    parseList({ source, html }) {
      return parseListHtml(source, html);
    },
    resolveDetailUrl({ item }) {
      return clean(item.noticeUrl);
    },
    buildDetailRequest({ item }) {
      return { url: new URL(item.noticeUrl).toString(), kind: "detail" };
    },
    parseDetail({ source, item, html }) {
      const $ = loadHtml(String(html ?? ""));
      const configuredDetailTitleSelector = clean(source.detailTitleSelector);
      const configuredDetailTitleMatches = configuredDetailTitleSelector
        ? $(configuredDetailTitleSelector)
        : null;
      const detailTitleCandidates = [
        configuredDetailTitleMatches?.first().text() ?? "",
        ...DETAIL_TITLE_SELECTORS.map((selector) => $(selector).first().text()),
        $('meta[property="og:title"]').attr("content"),
        $("title").first().text(),
        $("h1, h2, h3").first().text(),
      ].map(clean).filter((value, index, values) => value && values.indexOf(value) === index).slice(0, 12);
      const detailIdentity = {
        ...verifyOperationalDetailTitleIdentity(item.title, detailTitleCandidates),
        configured_detail_title_selector: configuredDetailTitleSelector || null,
        detail_title_selector_match_count: configuredDetailTitleMatches?.length ?? 0,
        detail_title_extracted: Boolean(clean(configuredDetailTitleMatches?.first().text())),
      };
      $("script, style, nav, footer, header, aside, noscript").remove();
      const extracted = extractDetailFromCheerio($, {
        baseUrl: item.noticeUrl || source.baseUrl || source.listUrl,
        sourceId: source.sourceId,
        detailContentSelector: source.detailContentSelector,
      });
      const detailDate = source.detailDateSelector
        ? clean($(source.detailDateSelector).first().text())
        : "";
      return {
        ...extracted,
        detailDate,
        detailTitle: detailTitleCandidates[0] ?? "",
        detailTitleCandidates,
        detailIdentity,
      };
    },
    extractAttachmentMetadata({ detail }) {
      return Array.isArray(detail.attachmentMetadata) ? detail.attachmentMetadata : [];
    },
    normalizeNotice({ source, sourceId, item, detail, attachmentMetadata }) {
      const originalUrl = clean(item.noticeUrl);
      return {
        ...item,
        ...detail,
        sourceId,
        source_key: sourceId,
        source_id: sourceId,
        sourceName: item.sourceName ?? source.sourceName,
        original_url: originalUrl,
        canonical_url: canonicalizeNoticeUrl(originalUrl),
        body: clean(detail.content),
        image_urls: Array.isArray(detail.imageUrls) ? detail.imageUrls : [],
        attachment_metadata: attachmentMetadata,
        attachmentMetadata,
      };
    },
  });
}
