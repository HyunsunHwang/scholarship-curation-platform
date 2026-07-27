import assert from "node:assert/strict";
import { buildReport, validateInventory } from "./build-verified-source-parser-remediation-report.mjs";

const source = { sourceId: "sample_001", sourceName: "Sample", universitySlug: "sample", listUrl: "https://example.test/list", noticeUrlPattern: "id=\\d+" };
const diagnostic = (status, capability, metrics = {}) => ({ source_id: source.sourceId, runtime_result_status: status, capability_status: capability, operational_codes: [], parser_evidence: { parser_strategy: "heuristic_anchor", profile_applied: false, list_parser_profile: null }, metrics });
const report = (item) => ({ sourceRegistry: { sourceCount: 1 }, operationalDiagnostics: { source_diagnostics: [item] } });
const target = [{ sourceId: source.sourceId, parserStrategy: "heuristic_anchor" }];
const control = report(diagnostic("success", "valid_zero_candidates", { candidate_navigation_leak_count: 0, detail_identity_verified_count: 3 }));
const treatment = report(diagnostic("success", "valid_zero_candidates", { candidate_navigation_leak_count: 0, detail_identity_verified_count: 3 }));
const output = buildReport({ targetInventory: target, controlReport: control, treatmentReport: treatment, sources: { [source.sourceId]: source }, git: {} });
assert.equal(output.inventory[0].final_state, "verified_heuristic_safe");
assert.throws(() => validateInventory([], 1), /Expected 1/);
console.log("verified_source_parser_remediation_inventory_tests_passed=2");
