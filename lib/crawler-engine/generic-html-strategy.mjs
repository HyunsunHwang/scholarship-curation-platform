import { load as loadHtml } from "cheerio";
import { canonicalizeNoticeUrl } from "../post-phase-l/normalized-graph.mjs";
import { extractDetailFromCheerio } from "../notice-body-extraction.mjs";

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
      $("script, style, nav, footer, header, aside, noscript").remove();
      const extracted = extractDetailFromCheerio($, {
        baseUrl: item.noticeUrl || source.baseUrl || source.listUrl,
        sourceId: source.sourceId,
        detailContentSelector: source.detailContentSelector,
      });
      const detailDate = source.detailDateSelector
        ? clean($(source.detailDateSelector).first().text())
        : "";
      return { ...extracted, detailDate };
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
