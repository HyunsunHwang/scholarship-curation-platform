import assert from "node:assert/strict";
import { injectPhase4ActionEvidence, loadPhase4ActionEvidence } from "../lib/crawler-engine/runtime-diagnostics/phase4-action-evidence-loader.mjs";

const row = { source_id: "cau_004", capture_status: "capture_success", comparison_validation_status: "exact_valid", action_class: "no_action", evidence_basis: "same_html_delta", artifact_file_sha256: "a".repeat(64), normalized_transport_failure: null, same_html_comparison: { candidate_comparison: {} } };
const report = { schema_version: "phase4-authoritative-evidence-reconciliation-v2", sources: [row] };
const evidence = loadPhase4ActionEvidence(report, { expectedSourceIds: ["cau_004"] });
assert.equal(evidence.get("cau_004").action_class, "no_action");
assert.equal(injectPhase4ActionEvidence({ source_diagnostics: [{ source_id: "cau_004" }] }, evidence).source_diagnostics[0].remediationEvidence.comparison_validation_status, "exact_valid");
assert.throws(() => loadPhase4ActionEvidence({ ...report, sources: [{ ...row, comparison_validation_status: "not_present" }] }), { code: "phase4_action_evidence_invalid" });
console.log("Phase 4 action evidence loader tests: 3/3 passed");
