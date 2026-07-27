import assert from "node:assert/strict";
import { buildPhase2CandidateComparison } from "../lib/crawler-engine/runtime-diagnostics/phase2-candidate-comparison.mjs";

const htmlSha256 = "a".repeat(64);
const input = {
  sourceId: "fixture_001",
  control: { html_sha256: htmlSha256, candidates: [{ noticeUrl: "https://example.test/notice/1#top", disposition: "real_notice" }] },
  treatment: { html_sha256: htmlSha256, candidates: [{ noticeUrl: "https://example.test/notice/1", disposition: "real_notice" }] },
};
const first = buildPhase2CandidateComparison(input);
const second = buildPhase2CandidateComparison(input);
assert.deepEqual(first, second);
assert.equal(first.candidate_recall_verified, true);
assert.equal(first.common_candidate_count, 1);
assert.deepEqual(first.common_candidate_keys, ["url:https://example.test/notice/1"]);

const explicitKey = buildPhase2CandidateComparison({
  ...input,
  control: { html_sha256: htmlSha256, candidates: [{ candidateKey: "stable-1", noticeUrl: "https://example.test/notice/1" }] },
  treatment: { html_sha256: htmlSha256, candidates: [{ candidateKey: "stable-1", noticeUrl: "https://example.test/another" }] },
});
assert.deepEqual(explicitKey.common_candidate_keys, ["key:stable-1"]);

const canonicalizedQuery = buildPhase2CandidateComparison({
  ...input,
  control: { html_sha256: htmlSha256, candidates: [{ noticeUrl: "https://example.test/notice?b=2&a=1" }] },
  treatment: { html_sha256: htmlSha256, candidates: [{ noticeUrl: "https://example.test/notice?a=1&b=2#top" }] },
});
assert.equal(canonicalizedQuery.common_candidate_count, 1);

const removed = buildPhase2CandidateComparison({ ...input, treatment: { html_sha256: htmlSha256, candidates: [] } });
assert.equal(removed.removed_real_notice_count, 1);
assert.equal(removed.candidate_recall_verified, false);
assert.equal(removed.removed_candidates[0].classification, "real_notice");

const removedNavigation = buildPhase2CandidateComparison({
  ...input,
  control: { html_sha256: htmlSha256, candidates: [{ candidateKey: "nav", classification: "navigation", inside_navigation_container: true }] },
  treatment: { html_sha256: htmlSha256, candidates: [] },
});
assert.equal(removedNavigation.removed_navigation_count, 1);
assert.equal(removedNavigation.candidate_recall_verified, true);

const removedPagination = buildPhase2CandidateComparison({
  ...input,
  control: { html_sha256: htmlSha256, candidates: [{ candidateKey: "page", classification: "pagination", inside_pagination_container: true }] },
  treatment: { html_sha256: htmlSha256, candidates: [] },
});
assert.equal(removedPagination.removed_pagination_count, 1);

const removedUnknown = buildPhase2CandidateComparison({
  ...input,
  control: { html_sha256: htmlSha256, candidates: [{ candidateKey: "unknown", classification: "unknown" }] },
  treatment: { html_sha256: htmlSha256, candidates: [] },
});
assert.equal(removedUnknown.removed_unresolved_count, 1);
assert.equal(removedUnknown.candidate_recall_verified, false);

const addedUnknown = buildPhase2CandidateComparison({
  ...input,
  treatment: { html_sha256: htmlSha256, candidates: [...input.treatment.candidates, { candidateKey: "unknown-2", classification: "unknown" }] },
});
assert.equal(addedUnknown.added_false_positive_count, 1);
assert.equal(addedUnknown.candidate_recall_verified, false);

assert.throws(() => buildPhase2CandidateComparison({ ...input, treatment: { ...input.treatment, html_sha256: "b".repeat(64) } }), /identical SHA-256/);
assert.throws(() => buildPhase2CandidateComparison({ ...input, control: { html_sha256: htmlSha256, candidates: [{ candidateKey: "x" }, { candidateKey: "x" }] } }), /duplicate identity/);
assert.throws(() => buildPhase2CandidateComparison({ ...input, control: { html_sha256: htmlSha256, candidates: [{ noticeUrl: "https://example.test/notice?a=1&b=2" }, { noticeUrl: "https://example.test/notice?b=2&a=1#x" }] } }), /duplicate identity/);
console.log("phase2_candidate_comparison_tests_passed=11");
