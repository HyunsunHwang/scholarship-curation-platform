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

function dateValues(value) {
  return clean(value).match(/20\d{2}\s*(?:[./-]|년)\s*\d{1,2}\s*(?:[./-]|월)\s*\d{1,2}\s*일?/g) ?? [];
}

function inlineDateEvidence(section) {
  const text = `${clean(section.title)} ${clean(section.body)}`;
  const evidence = [];
  for (const value of section.publishedDateTexts ?? []) {
    for (const date of dateValues(value)) evidence.push({ role: "published_date", value: date, evidence: clean(value) });
  }
  for (const date of dateValues(text)) {
    const offset = text.indexOf(date);
    const context = text.slice(Math.max(0, offset - 32), offset + date.length + 32).toLowerCase();
    const role = /신청|접수|application/.test(context) ? "application_date"
      : /결과|발표|선발|result/.test(context) ? "result_date"
        : /면접|interview/.test(context) ? "interview_date"
          : /지급|payment/.test(context) ? "payment_date" : "unknown_date";
    evidence.push({ role, value: date, evidence: context });
  }
  return evidence;
}

function stableSectionIdentity(sourceId, section, duplicateTitle, usedIdentities) {
  const title = section.title;
  const body = section.body;
  const normalizedTitle = clean(title).toLocaleLowerCase("ko-KR");
  const titleHash = createHash("sha256")
    .update(`${clean(sourceId)}\n${normalizedTitle}`)
    .digest("hex")
    .slice(0, 20);
  let identity = `inline-${titleHash}`;
  const anchor = clean(section.anchorId);
  if (anchor) identity = `${identity}-${createHash("sha256").update(anchor).digest("hex").slice(0, 12)}`;
  if (duplicateTitle || usedIdentities.has(identity)) {
    const bodyHash = createHash("sha256")
      .update(clean(body).slice(0, 320).toLocaleLowerCase("ko-KR"))
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
        section,
        (titleCounts.get(normalizedTitle) ?? 0) > 1,
        usedIdentities,
      );
      const noticeUrl = `${source.listUrl}#${inlineSectionId}`;
      const pageUrl = new URL(source.listUrl);
      pageUrl.hash = "";
      const canonicalPageUrl = pageUrl.toString();
      const attachmentMetadata = section.links
        .filter((link) => link.role === "attachment")
        .map((link) => ({ url: link.url, name: link.label, source: "inline_section" }));
      const applicationLinks = section.links.filter((link) => link.role === "application_form");
      const supportingReferenceLinks = section.links.filter((link) => link.role === "supporting_reference");
      const dateEvidence = inlineDateEvidence(section);
      const publishedDate = dateEvidence.find((entry) => entry.role === "published_date")?.value ?? "";
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        universitySlug: source.universitySlug,
        universityId: source.universityId,
        collegeId: source.collegeId,
        departmentId: source.departmentId,
        listUrl: source.listUrl,
        noticeUrl,
        displayUrl: noticeUrl,
        display_url: noticeUrl,
        original_url: noticeUrl,
        canonical_url: canonicalPageUrl,
        canonicalPageUrl,
        canonical_page_url: canonicalPageUrl,
        observationId: inlineSectionId,
        inlineSectionId,
        inline_section_id: inlineSectionId,
        identityKind: "inline_section_id",
        identity_kind: "inline_section_id",
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
        dateText: publishedDate,
        detailDate: publishedDate,
        inlineDateEvidence: dateEvidence,
        inline_date_evidence: dateEvidence,
        content: body,
        body,
        inlineSectionLinks: section.links,
        inline_section_links: section.links,
        applicationLinks,
        application_links: applicationLinks,
        supportingReferenceLinks,
        supporting_reference_links: supportingReferenceLinks,
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
