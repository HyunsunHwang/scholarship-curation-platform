import assert from "node:assert/strict";
import { buildPhase2Baseline } from "./build-phase2-parser-remediation-baseline.mjs";

const historicalReport = { inventory: Array.from({ length: 87 }, (_, index) => ({ source_id: `test_${String(index).padStart(3, "0")}`, university_slug: "test", source_name: "Test", parser_strategy_before: "heuristic_anchor" })) };
const runtimeReport = { runAt: "2026-07-27T00:00:00.000Z", sourceRegistry: { sourceCount: 545 }, operationalDiagnostics: { source_diagnostics: historicalReport.inventory.map((item) => ({ source_id: item.source_id, runtime_result_status: "success", capability_status: "valid_zero_candidates", primary_failure_code: null, operational_codes: [], parser_evidence: { parser_strategy: "heuristic_anchor" }, metrics: { candidate_navigation_leak_count: 0, navigation_url_overlap_count: 1, detail_identity_verified_count: 0 } })) } };
const baseline = buildPhase2Baseline({ historicalReport, runtimeReport });
assert.equal(baseline.target_count, 87);
assert.equal(baseline.current_summary.selected_navigation_leak_source_count, 0);
assert.equal(baseline.current_summary.navigation_url_overlap_source_count, 87);
assert.throws(() => buildPhase2Baseline({ historicalReport: { inventory: [] }, runtimeReport }), /exactly 87/);
console.log("phase2_parser_remediation_baseline_tests_passed=4");
