import assert from "node:assert/strict";
import { buildReport, validateInventory } from "./build-verified-source-parser-remediation-report.mjs";

const source = { sourceId: "sample_001", sourceName: "Sample", universitySlug: "sample", listUrl: "https://example.test/list", noticeUrlPattern: "id=\\d+" };
const diagnostic = (status, capability, metrics = {}) => ({ source_id: source.sourceId, runtime_result_status: status, capability_status: capability, operational_codes: [], parser_evidence: { parser_strategy: "heuristic_anchor", profile_applied: false, list_parser_profile: null }, metrics });
const report = (item) => ({ sourceRegistry: { sourceCount: 1 }, operationalDiagnostics: { source_diagnostics: [item] } });
const target = [{ sourceId: source.sourceId, parserStrategy: "heuristic_anchor" }];
const control = report(diagnostic("success", "valid_zero_candidates", { candidate_navigation_leak_count: 0, detail_identity_verified_count: 3 }));
const treatment = report(diagnostic("success", "valid_zero_candidates", { candidate_navigation_leak_count: 0, detail_identity_verified_count: 3 }));
const proof = {
  control_candidate_count: 1, treatment_candidate_count: 1, common_candidate_count: 1,
  removed_candidate_count: 0, added_candidate_count: 0, removed_real_notice_count: 0,
  removed_unresolved_count: 0, added_false_positive_count: 0,
};
const output = buildReport({ targetInventory: target, controlReport: control, treatmentReport: treatment, sources: { [source.sourceId]: source }, git: { recall_proof: { [source.sourceId]: proof } } });
assert.equal(output.inventory[0].final_state, "verified_heuristic_safe");
assert.equal(output.inventory[0].next_action, "collect_pagination_evidence");
assert.equal(output.inventory[0].next_phase_queue, "pagination_verification");
const noProof = buildReport({ targetInventory: target, controlReport: control, treatmentReport: treatment, sources: { [source.sourceId]: source }, git: {} });
assert.equal(noProof.inventory[0].final_state, "blocked_insufficient_authoritative_evidence");
assert.throws(() => validateInventory([], 1), /Expected 1/);
const configured = { ...output.inventory[0], source_id: "hanyang_011", final_state: "configured_selector_applied", phase2_status: "configured_selector_applied", candidate_recall_verified: false, candidate_recall_status: "unverified" };
assert.throws(() => validateInventory([configured], 1), /terminal recall invariant/);
assert.throws(() => validateInventory([{ ...output.inventory[0], removed_real_notice_count: 1 }], 1), /terminal parser evidence invariant/);
assert.throws(() => validateInventory([{ ...output.inventory[0], fixture_identity_case_count: 1, fixture_identity_verified_count: 2 }], 1), /fixture identity invariant/);
console.log("verified_source_parser_remediation_inventory_tests_passed=6");
