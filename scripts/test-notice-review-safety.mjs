import assert from "node:assert/strict";
import {
  applyNoticePromotionSafety,
  evaluateNoticeReviewSafety,
} from "../lib/review/notice-review-safety.mjs";

const base = {
  title: "2026 scholarship announcement",
  originalUrl: "https://example.edu/notices/42",
  body: "A".repeat(100),
  imageUrls: ["https://example.edu/files/poster.png"],
};

const clean = evaluateNoticeReviewSafety(base);
assert.equal(clean.publicPublicationAllowed, true);
assert.equal(clean.requiresAdminReview, false);
assert.deepEqual(clean.reasons, []);

const duplicate = evaluateNoticeReviewSafety({ ...base, duplicateSuspected: true });
assert.equal(duplicate.publicPublicationAllowed, false);
assert.equal(duplicate.requiresAdminReview, true);
assert.ok(duplicate.reasons.includes("duplicate_review"));

const incomplete = evaluateNoticeReviewSafety({ ...base, originalUrl: "", body: "" });
assert.equal(incomplete.publicPublicationAllowed, false);
assert.ok(incomplete.reasons.includes("evidence_incomplete"));

const duplicateLookupUnavailable = evaluateNoticeReviewSafety({ ...base, duplicateEvidenceUnavailable: true });
assert.equal(duplicateLookupUnavailable.publicPublicationAllowed, false);
assert.ok(duplicateLookupUnavailable.reasons.includes("evidence_incomplete"));

const shortBody = evaluateNoticeReviewSafety({ ...base, body: "Too short" });
assert.equal(shortBody.publicPublicationAllowed, false);
assert.ok(shortBody.reasons.includes("short_body"));
assert.ok(shortBody.reasons.includes("quality_review"));

const unreadable = evaluateNoticeReviewSafety({ ...base, body: "Valid text \ufffd broken extraction".padEnd(100, "x") });
assert.equal(unreadable.publicPublicationAllowed, false);
assert.ok(unreadable.reasons.includes("body_unreadable"));

const noAssetsOnly = evaluateNoticeReviewSafety({ ...base, imageUrls: [] });
assert.equal(noAssetsOnly.publicPublicationAllowed, true);
assert.equal(noAssetsOnly.requiresAdminReview, false);
assert.deepEqual(noAssetsOnly.reasons, ["missing_assets"]);

const publishablePayload = { is_verified: true, list_on_home: true, apply_url: "" };
const normalPromotion = applyNoticePromotionSafety(publishablePayload, {
  originalUrl: base.originalUrl,
  safety: clean,
  postPhaseLEnvironment: false,
});
assert.equal(normalPromotion.is_verified, true);
assert.equal(normalPromotion.list_on_home, true);
assert.equal(normalPromotion.homepage_url, base.originalUrl);
assert.equal(normalPromotion.apply_url, base.originalUrl);

const heldPromotion = applyNoticePromotionSafety(publishablePayload, {
  originalUrl: base.originalUrl,
  safety: duplicate,
  postPhaseLEnvironment: false,
});
assert.equal(heldPromotion.is_verified, false);
assert.equal(heldPromotion.list_on_home, false);

const lPromotion = applyNoticePromotionSafety(publishablePayload, {
  originalUrl: base.originalUrl,
  safety: clean,
  postPhaseLEnvironment: true,
});
assert.equal(lPromotion.is_verified, false);
assert.equal(lPromotion.list_on_home, false);

console.log("notice_review_safety=pass");
