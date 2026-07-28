import { createHash } from "node:crypto";

export const SUPPORTED_NOTICE_IDENTITY_KINDS = Object.freeze([
  "external_article_id",
  "canonical_detail_url",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function canonicalUrl(value) {
  try {
    const url = new URL(clean(value));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function externalArticleId(value) {
  try {
    const url = new URL(clean(value));
    for (const key of ["BBS_SEQ", "uid", "articleNo", "boardNo", "nttNo", "wr_id", "b_idx", "seq", "no"]) {
      const candidate = clean(url.searchParams.get(key));
      if (/^[A-Za-z0-9_-]+$/.test(candidate)) return `${key}:${candidate}`;
    }
  } catch {}
  return "";
}

/**
 * Formal Notice identity for ingestion/handoff.
 *
 * Inline section IDs are observation/evidence metadata only. They must not become
 * independent Notice identity kinds. One canonical detail page maps to one Notice.
 */
export function resolveNoticeIdentity(notice = {}) {
  const displayUrl = clean(
    notice.displayUrl
      ?? notice.display_url
      ?? notice.noticeUrl
      ?? notice.notice_url
      ?? notice.original_url,
  );
  const canonical = canonicalUrl(
    notice.canonicalUrl
      ?? notice.canonical_url
      ?? notice.canonicalPageUrl
      ?? notice.canonical_page_url
      ?? displayUrl,
  );
  const inlineSectionId = clean(notice.inlineSectionId ?? notice.inline_section_id);
  const articleId = clean(notice.externalArticleId ?? notice.external_article_id)
    || externalArticleId(canonical)
    || externalArticleId(displayUrl);
  const identityKind = articleId ? "external_article_id" : "canonical_detail_url";
  const identityValue = articleId || canonical;
  return Object.freeze({
    identityKind,
    identity_kind: identityKind,
    identityValue,
    identity_value: identityValue,
    // Preserved as section evidence metadata; never used as Notice identity_kind.
    inlineSectionId: inlineSectionId || null,
    inline_section_id: inlineSectionId || null,
    externalArticleId: articleId || null,
    external_article_id: articleId || null,
    canonicalUrl: canonical || null,
    canonical_url: canonical || null,
    canonicalPageUrl: canonical || null,
    canonical_page_url: canonical || null,
    displayUrl: displayUrl || canonical || null,
    display_url: displayUrl || canonical || null,
  });
}

export function noticeIdentityFingerprint(sourceId, notice = {}) {
  const identity = resolveNoticeIdentity(notice);
  if (!clean(sourceId) || !identity.identityValue) return null;
  return createHash("sha256")
    .update(`${clean(sourceId)}\n${identity.identityKind}\n${identity.identityValue}`)
    .digest("hex");
}

export function isSupportedNoticeIdentityKind(kind) {
  return SUPPORTED_NOTICE_IDENTITY_KINDS.includes(clean(kind));
}
