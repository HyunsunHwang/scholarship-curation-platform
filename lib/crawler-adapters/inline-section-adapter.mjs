import { createHash } from "node:crypto";
import {
  attachOperationalListParserEvidence,
  classifyOperationalLinkRole,
  collectOperationalListParserEvidence,
} from "../crawler-engine/operational-parser-evidence.mjs";
import { parseInlineSections } from "../crawler-engine/inline-section-parser.mjs";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function dateText(value) {
  const text = clean(value);
  const fullDate = text.match(
    /20\d{2}\s*(?:[./-]|\uB144)\s*\d{1,2}\s*(?:[./-]|\uC6D4)\s*\d{1,2}\s*\uC77C?/,
  )?.[0];
  if (fullDate) return fullDate;
  return text.match(/(?:^|\D)(\d{1,2}\s*[./]\s*\d{1,2})(?!\d)/)?.[1] ?? "";
}

function stableSectionIdentity(sourceId, title, body, duplicateTitle, usedIdentities) {
  const normalizedTitle = clean(title).toLocaleLowerCase("ko-KR");
  const titleHash = createHash("sha256")
    .update(`${clean(sourceId)}\n${normalizedTitle}`)
    .digest("hex")
    .slice(0, 20);
  let identity = `inline-${titleHash}`;
  if (duplicateTitle || usedIdentities.has(identity)) {
    const bodyHash = createHash("sha256")
      .update(clean(body).toLocaleLowerCase("ko-KR"))
      .digest("hex")
      .slice(0, 12);
    identity = `${identity}-${bodyHash}`;
  }
  usedIdentities.add(identity);
  return identity;
}

function resolveLink(href, source) {
  try {
    const url = new URL(clean(href), source.listUrl || source.baseUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

/**
 * Extracts repeated title/body sections from one already-fetched document.
 * Traversal follows document order once, so a heading and its body may live in
 * different nested wrappers. Navigation chrome is excluded and the scan is bounded.
 */
export function extractInlineSectionNotices(source = {}, html = "") {
  const parsed = parseInlineSections(source, html);
  const sections = parsed.sections.map((section) => ({
    ...section,
    links: section.links.map(({ href, label }) => ({
      url: resolveLink(href, source),
      label,
      role: classifyOperationalLinkRole({ href, text: label, source }),
    })).filter((link) => link.url),
  }));

  const usedIdentities = new Set();
  const extractableSections = sections.filter((section) =>
    section.title && clean(section.body).length >= 20);
  const titleCounts = new Map();
  for (const section of extractableSections) {
    const normalizedTitle = clean(section.title).toLocaleLowerCase("ko-KR");
    titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) ?? 0) + 1);
  }
  const notices = extractableSections
    .map((section) => {
      const body = clean(section.body);
      const normalizedTitle = clean(section.title).toLocaleLowerCase("ko-KR");
      const inlineSectionId = stableSectionIdentity(
        source.sourceId,
        section.title,
        body,
        (titleCounts.get(normalizedTitle) ?? 0) > 1,
        usedIdentities,
      );
      const noticeUrl = `${source.listUrl}#${inlineSectionId}`;
      const attachmentMetadata = section.links
        .filter((link) => link.role === "attachment")
        .map((link) => ({ url: link.url, name: link.label, source: "inline_section" }));
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        universitySlug: source.universitySlug,
        universityId: source.universityId,
        collegeId: source.collegeId,
        departmentId: source.departmentId,
        listUrl: source.listUrl,
        noticeUrl,
        original_url: noticeUrl,
        canonical_url: noticeUrl,
        observationId: inlineSectionId,
        inlineSectionId,
        title: section.title,
        detailTitle: section.title,
        detailTitleCandidates: [section.title],
        detailIdentity: {
          status: "verified",
          verified: true,
          comparison_mode: "inline_section_identity",
          normalized_list_title: clean(section.title).toLocaleLowerCase("ko-KR"),
          normalized_detail_title: clean(section.title).toLocaleLowerCase("ko-KR"),
        },
        dateText: dateText(`${section.title} ${body}`),
        detailDate: dateText(`${section.title} ${body}`),
        content: body,
        body,
        inlineSectionLinks: section.links,
        inline_section_links: section.links,
        attachmentMetadata,
        attachment_metadata: attachmentMetadata,
        detailContentAlreadyAvailable: true,
      };
    });

  const parserEvidence = collectOperationalListParserEvidence(source, html, notices);
  return attachOperationalListParserEvidence(notices, Object.freeze({
    ...parserEvidence,
    parser_strategy: "inline_section_adapter",
    parser_strategies: ["inline_section_adapter"],
    parser_fallback_used: false,
    fallback_scan_used: false,
    parser_fallback_recovered: false,
  }));
}

export async function fetchInlineSectionNotices(source, options = {}) {
  const { transportClient, signal } = options;
  if (!transportClient || typeof transportClient.fetchText !== "function") {
    throw new TypeError("inline_sections adapter requires an injected transportClient");
  }
  const response = await transportClient.fetchText(source.listUrl, {
    kind: "list",
    retryCount: 0,
    signal,
    accept: "text/html,application/xhtml+xml",
  });
  return extractInlineSectionNotices(source, response.text);
}
