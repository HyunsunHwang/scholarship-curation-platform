const MINIMUM_BODY_LENGTH = 80;

export const REVIEW_REASON_CODES = Object.freeze([
  "duplicate_review",
  "quality_review",
  "missing_assets",
  "short_body",
  "body_unreadable",
  "evidence_incomplete",
]);

function text(value) {
  return String(value ?? "").trim();
}

function hasValidOriginalUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasUnreadableBody(body) {
  return /\ufffd|(?:Ã.|Â.|â..)/.test(body);
}

/**
 * Derives a non-persistent safety decision for the existing crawled-notice
 * compatibility flow. It never detects or merges duplicates on its own.
 */
export function evaluateNoticeReviewSafety(input) {
  const title = text(input?.title);
  const originalUrl = text(input?.originalUrl ?? input?.noticeUrl);
  const body = text(input?.body);
  const assetCount = Array.isArray(input?.imageUrls)
    ? input.imageUrls.filter((value) => text(value)).length
    : 0;
  const duplicateSuspected = input?.duplicateSuspected === true;
  const duplicateEvidenceUnavailable = input?.duplicateEvidenceUnavailable === true;
  const reasons = [];

  if (duplicateSuspected) reasons.push("duplicate_review");
  if (assetCount === 0) reasons.push("missing_assets");

  const unreadable = hasUnreadableBody(body);
  const shortBody = body.length > 0 && body.length < MINIMUM_BODY_LENGTH;
  if (shortBody) reasons.push("short_body");
  if (unreadable) reasons.push("body_unreadable");
  if (shortBody || unreadable) reasons.push("quality_review");

  const evidenceIncomplete = !title || !hasValidOriginalUrl(originalUrl) || !body || duplicateEvidenceUnavailable;
  if (evidenceIncomplete) reasons.push("evidence_incomplete");

  const uniqueReasons = [...new Set(reasons)];
  const requiresAdminReview = duplicateSuspected || shortBody || unreadable || evidenceIncomplete;

  return Object.freeze({
    reasons: uniqueReasons,
    hasAssets: assetCount > 0,
    assetCount,
    bodyQuality: unreadable
      ? "body_unreadable"
      : shortBody
        ? "short_body"
        : body
          ? assetCount === 0 ? "text_sufficient_no_assets" : "good_text"
          : "evidence_incomplete",
    evidenceIncomplete,
    requiresAdminReview,
    publicPublicationAllowed: !requiresAdminReview,
  });
}

/**
 * Applies the publication boundary without rejecting the human's save. A held
 * record remains available to administrators but cannot enter public queries.
 */
export function applyNoticePromotionSafety(payload, options) {
  const originalUrl = text(options?.originalUrl);
  const safety = options?.safety ?? evaluateNoticeReviewSafety({});
  const mustHold = options?.postPhaseLEnvironment === true || !safety.publicPublicationAllowed;

  return {
    ...payload,
    homepage_url: originalUrl || payload.homepage_url || null,
    apply_url: payload.apply_url || originalUrl,
    is_verified: mustHold ? false : payload.is_verified,
    list_on_home: mustHold ? false : payload.list_on_home,
  };
}
