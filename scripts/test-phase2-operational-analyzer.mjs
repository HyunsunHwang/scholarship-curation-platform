import assert from "node:assert/strict";
import { analyzePhase2ParserRemediation } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";

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
const diagnostic = ({ strategy = "heuristic_anchor", profileApplied = false, configuredSelector = "", status = "success", capability = "valid_zero_candidates" } = {}) => ({
  runtime_result_status: status,
  capability_status: capability,
  parser_evidence: {
    parser_strategy: strategy,
    profile_applied: profileApplied,
    configured_list_selector: configuredSelector,
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

const noProof = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic(),
});
assert.equal(noProof.phase2_status, "manual_review_required");
assert.equal(noProof.candidate_recall.candidate_recall_verified, false);
assert.ok(noProof.analysis_codes.includes("CANDIDATE_RECALL_UNVERIFIED"));

const configured = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic({ strategy: "configured_selector", configuredSelector: ".board tr" }),
  candidateComparison: comparison,
});
assert.equal(configured.phase2_status, "configured_selector_applied");

const contradictory = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic(),
  treatmentDiagnostic: diagnostic(),
  candidateComparison: { ...comparison, candidate_recall_verified: true, removed_real_notice_count: 1 },
});
assert.equal(contradictory.analysis_valid, false);
assert.ok(contradictory.analysis_codes.includes("ANALYZER_EVIDENCE_CONTRADICTION"));

const unreachable = analyzePhase2ParserRemediation({
  source,
  controlDiagnostic: diagnostic({ status: "network_error" }),
  treatmentDiagnostic: diagnostic({ status: "network_error" }),
  candidateComparison: comparison,
});
assert.equal(unreachable.phase2_status, "source_unreachable");

console.log("phase2_operational_analyzer_tests_passed=5");
