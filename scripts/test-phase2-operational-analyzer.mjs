import assert from "node:assert/strict";
import { analyzePhase2ParserRemediation } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
import { buildPhase2CandidateComparison } from "../lib/crawler-engine/runtime-diagnostics/phase2-candidate-comparison.mjs";

const source = { sourceId: "fixture_001", sourceName: "Fixture", universitySlug: "fixture" };
const comparison = {
  control_candidate_count: 3,
  treatment_candidate_count: 3,
  common_candidate_count: 3,
  removed_candidate_count: 0,
  added_candidate_count: 0,
  removed_real_notice_count: 0,
  removed_unresolved_count: 0,
  added_false_positive_count: 0,
};
const diagnostic = ({ strategy = "heuristic_anchor", profileApplied = false, configuredSelector = "", selectorMatch = null, status = "success", capability = "valid_zero_candidates" } = {}) => ({
  runtime_result_status: status,
  capability_status: capability,
  parser_evidence: {
    parser_strategy: strategy,
    profile_applied: profileApplied,
    configured_list_selector: configuredSelector,
    selector_match_count: selectorMatch,
  },
  metrics: { candidate_navigation_leak_count: 0, detail_identity_verified_count: 3 },
});

const verified = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic(),
  candidateComparison: comparison,
});
assert.equal(verified.analysis_valid, true);
assert.equal(verified.phase2_status, "verified_heuristic_safe");
assert.equal(verified.candidate_recall.candidate_recall_verified, true);
assert.equal(verified.list_parser_contract_status, "verified");
assert.equal(verified.detail_identity_status, "verified");
assert.equal(verified.pagination_status, "unverified");
assert.equal(verified.next_phase_queue, "pagination_verification");

const generatedComparison = buildPhase2CandidateComparison({
  sourceId: source.sourceId,
  control: { html_sha256: "c".repeat(64), candidates: [{ noticeUrl: "https://example.test/1", disposition: "real_notice" }] },
  treatment: { html_sha256: "c".repeat(64), candidates: [{ noticeUrl: "https://example.test/1", disposition: "real_notice" }] },
});
const generatedEvidence = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic(),
  candidateComparison: generatedComparison,
});
assert.equal(generatedEvidence.candidate_recall_status, "verified");

const noProof = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic(),
});
assert.equal(noProof.phase2_status, "blocked_insufficient_authoritative_evidence");
assert.equal(noProof.candidate_recall.candidate_recall_verified, false);
assert.ok(noProof.analysis_codes.includes("CANDIDATE_RECALL_UNVERIFIED"));

const noIdentity = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: { ...diagnostic(), metrics: { candidate_navigation_leak_count: 0, detail_identity_verified_count: 0, list_candidate_count: 3 } },
  candidateComparison: comparison,
});
assert.equal(noIdentity.list_parser_contract_status, "verified");
assert.equal(noIdentity.detail_identity_status, "unverified");
assert.equal(noIdentity.next_phase_queue, "detail_identity_verification");

const partialIdentity = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: { ...diagnostic(), metrics: { candidate_navigation_leak_count: 0, detail_identity_verified_count: 2 } },
  candidateComparison: comparison,
});
assert.equal(partialIdentity.detail_identity_status, "partially_verified");

const configured = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic({ strategy: "configured_selector", configuredSelector: ".board tr", selectorMatch: 1 }),
  candidateComparison: comparison,
});
assert.equal(configured.phase2_status, "configured_selector_applied");

const unmatchedSelector = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic({ strategy: "configured_selector", configuredSelector: ".board tr", selectorMatch: 0 }),
  candidateComparison: comparison,
});
assert.equal(unmatchedSelector.analysis_valid, false);

const missingProfile = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic({ strategy: "parser_profile", profileApplied: true }),
  candidateComparison: comparison,
});
assert.equal(missingProfile.analysis_valid, false);
assert.equal(missingProfile.list_parser_contract_status, "invalid");

const missingLeakMetric = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: { ...diagnostic(), metrics: { detail_identity_verified_count: 3 } },
  candidateComparison: comparison,
});
assert.equal(missingLeakMetric.list_parser_contract_status, "limited_evidence");

const contradictory = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic(),
  candidateComparison: { ...comparison, candidate_recall_verified: true, removed_real_notice_count: 1 },
});
assert.equal(contradictory.analysis_valid, false);
assert.ok(contradictory.analysis_codes.includes("ANALYZER_EVIDENCE_CONTRADICTION"));

for (const invalidComparison of [
  { ...comparison, control_candidate_count: 2 },
  { ...comparison, treatment_candidate_count: 2 },
  { ...comparison, removed_candidate_count: -1 },
  { ...comparison, added_candidate_count: 0.5 },
  { ...comparison, common_candidate_count: undefined },
  { ...comparison, removed_unresolved_count: 1 },
]) {
  const output = analyzePhase2ParserRemediation({ source, controlDiagnostic: diagnostic(), treatmentDiagnostic: diagnostic(), candidateComparison: invalidComparison });
  assert.equal(output.analysis_valid, false);
  assert.notEqual(output.phase2_status, "verified_heuristic_safe");
}

const falsePositive = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic(),
  candidateComparison: { ...comparison, treatment_candidate_count: 4, added_candidate_count: 1, added_false_positive_count: 1 },
});
assert.equal(falsePositive.analysis_valid, true);
assert.equal(falsePositive.phase2_status, "blocked_insufficient_authoritative_evidence");

const unreachable = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic({ status: "network_error" }),
  treatmentDiagnostic: diagnostic({ status: "network_error" }),
  candidateComparison: comparison,
});
assert.equal(unreachable.phase2_status, "blocked_external");
assert.equal(unreachable.runtime_accessibility_status, "blocked_external");
assert.equal(unreachable.next_phase_queue, "external_retry");

const adapter = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic({ capability: "adapter_required" }),
  candidateComparison: comparison,
});
assert.equal(adapter.phase2_status, "adapter_required");
assert.equal(adapter.next_action, "implement_adapter");
assert.equal(adapter.next_phase_queue, "phase4_adapter");

const oneSidedFailure = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic({ status: "network_error" }),
  candidateComparison: comparison,
});
assert.equal(oneSidedFailure.runtime_accessibility_status, "transport_failure");
assert.notEqual(oneSidedFailure.phase2_status, "blocked_external");

console.log("phase2_operational_analyzer_tests_passed=16");
