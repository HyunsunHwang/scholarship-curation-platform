import assert from "node:assert/strict";
import { injectPhase4ActionEvidence, loadPhase4ActionEvidence } from "../lib/crawler-engine/runtime-diagnostics/phase4-action-evidence-loader.mjs";
import { phase4ReconciliationSha256 } from "../lib/crawler-engine/runtime-diagnostics/phase4-evidence-reconciliation.mjs";

const row = { source_id: "cau_004", capture_status: "capture_success", comparison_validation_status: "exact_valid", action_class: "no_action", evidence_basis: "same_html_delta", artifact_file_sha256: "a".repeat(64), normalized_transport_failure: null, same_html_comparison: { candidate_comparison: { control_candidate_count: 1, treatment_candidate_count: 1, common_candidate_count: 1, removed_candidate_count: 0, added_candidate_count: 0, removed_real_notice_count: 0, removed_unresolved_count: 0, added_false_positive_count: 0, candidate_recall_verified: true } } };
const report = { schema_version: "phase4-authoritative-evidence-reconciliation-v2", run_identity: "run", contract_fingerprint: "a".repeat(64), input_file_sha256: { private_artifact_index: "b".repeat(64), journal: "c".repeat(64), private_run_summary: "d".repeat(64) }, accounting: { expected_source_count: 1, index_source_count: 1, journal_source_count: 1, terminal_artifact_count: 1, incomplete_attempt_count: 0, artifact_file_count: 1, capture_success_count: 1, transport_lane_count: 0, verified_equivalent_count: 1, parser_regression_count: 0 }, sources: [row] };
report.reconciliation_sha256 = phase4ReconciliationSha256(report);
const evidence = loadPhase4ActionEvidence(report, { expectedSourceIds: ["cau_004"], expectedRunIdentity: "run", expectedContractFingerprint: "a".repeat(64), expectedInputFileSha256: report.input_file_sha256 });
assert.equal(evidence.get("cau_004").action_class, "no_action");
const injected = injectPhase4ActionEvidence({ source_diagnostics: [{ source_id: "cau_004", capability_status: "supported", operational_codes: [], runtime_result_status: "success" }] }, evidence).source_diagnostics[0];
assert.equal(injected.remediationEvidence.comparison_validation_status, "exact_valid");
assert.equal(injected.action_class, "no_action");
assert.throws(() => loadPhase4ActionEvidence({ ...report, sources: [{ ...row, comparison_validation_status: "not_present" }] }), { code: "phase4_action_evidence_invalid" });
for (const mutate of [
  (value) => ({ ...value, run_identity: "wrong" }),
  (value) => ({ ...value, contract_fingerprint: "e".repeat(64) }),
  (value) => ({ ...value, input_file_sha256: { ...value.input_file_sha256, journal: "f".repeat(64) } }),
  (value) => ({ ...value, accounting: { ...value.accounting, artifact_file_count: 2 } }),
  (value) => ({ ...value, sources: [row, row] }),
  (value) => ({ ...value, sources: [{ ...row, action_class: "transport_recovery" }] }),
]) {
  const mutated = mutate(report);
  assert.throws(() => loadPhase4ActionEvidence(mutated, { expectedSourceIds: ["cau_004"], expectedRunIdentity: "run", expectedContractFingerprint: "a".repeat(64), expectedInputFileSha256: report.input_file_sha256 }), { code: "phase4_action_evidence_invalid" });
}
console.log("Phase 4 action evidence loader tests: 3/3 passed");
