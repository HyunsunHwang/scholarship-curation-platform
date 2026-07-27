import assert from "node:assert/strict";
import { buildPhase2CandidateComparison } from "../lib/crawler-engine/runtime-diagnostics/phase2-candidate-comparison.mjs";

const htmlSha256 = "a".repeat(64);
const input = {
  sourceId: "fixture_001",
  control: { html_sha256: htmlSha256, candidates: [{ noticeUrl: "https://example.test/notice/1", disposition: "real_notice" }] },
  treatment: { html_sha256: htmlSha256, candidates: [{ noticeUrl: "https://example.test/notice/1", disposition: "real_notice" }] },
};
const first = buildPhase2CandidateComparison(input);
const second = buildPhase2CandidateComparison(input);
assert.deepEqual(first, second);
assert.equal(first.candidate_recall_verified, true);
assert.equal(first.common_candidate_count, 1);

const removed = buildPhase2CandidateComparison({ ...input, treatment: { html_sha256: htmlSha256, candidates: [] } });
assert.equal(removed.removed_real_notice_count, 1);
assert.equal(removed.candidate_recall_verified, false);

const addedUnknown = buildPhase2CandidateComparison({
  ...input,
  treatment: { html_sha256: htmlSha256, candidates: [...input.treatment.candidates, { candidateKey: "unknown-2" }] },
});
assert.equal(addedUnknown.added_false_positive_count, 1);
assert.equal(addedUnknown.candidate_recall_verified, false);

assert.throws(() => buildPhase2CandidateComparison({ ...input, treatment: { ...input.treatment, html_sha256: "b".repeat(64) } }), /identical SHA-256/);
assert.throws(() => buildPhase2CandidateComparison({ ...input, control: { html_sha256: htmlSha256, candidates: [{ candidateKey: "x" }, { candidateKey: "x" }] } }), /duplicate identity/);
console.log("phase2_candidate_comparison_tests_passed=5");
