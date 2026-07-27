import assert from "node:assert/strict";
import { buildPhase2CandidateComparison, buildPhase3RemediationClusters } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";

const hash = "a".repeat(64);
const clone = (value) => structuredClone(value);
function candidate(sourceId, key, url, classification = "real_notice", provenance = {}) {
  return { sourceId, candidateKey: key, noticeUrl: url, source_capture_hash: hash, classification, provenance };
}
function evidence(sourceId, { origin = "https://one.test", family = "table", recall = true } = {}) {
  const url = `${origin}/board/view?id=123#top`;
  const controlCandidates = [candidate(sourceId, "notice-1", url, "real_notice", { candidate_origin: "configured_selector", candidate_node_fingerprint: family === "table" ? "table.board tr:nth-child(17)" : "ul.cards li:nth-of-type(3)", matched_list_selector: family === "table" ? "table.board tr" : "ul.cards li", link_role: "same_origin_detail", inside_navigation_container: false, inside_pagination_container: false })];
  const treatmentCandidates = recall ? [candidate(sourceId, "notice-1", `${origin}/board/view?id=123`, "real_notice", controlCandidates[0].provenance)] : [candidate(sourceId, "unknown-2", `${origin}/board/view?id=456`, "unknown", controlCandidates[0].provenance)];
  const control = { source_id: sourceId, capture_id: `${sourceId}-capture`, requested_url: `${origin}/board`, final_url: `${origin}/board`, html_sha256: hash, candidates: controlCandidates };
  const treatment = { ...control, candidates: treatmentCandidates, parser_config: { list_item_selector: family === "table" ? "table.board tr" : "ul.cards li", link_selector: "a[href]", title_selector: ".subject", date_selector: ".date", list_parser_profile: null }, parser_evidence: { parser_strategy: "configured_selector", configured_list_selector: family === "table" ? "table.board tr" : "ul.cards li", matched_list_selector: family === "table" ? "table.board tr" : "ul.cards li", profile_applied: false, inline_notice_section_count: 0, independent_detail_url_count: 1 } };
  const comparison = buildPhase2CandidateComparison({ sourceId, control, treatment });
  return { schema_version: "phase2-same-html-comparison-v1", source_id: sourceId, capture_id: `${sourceId}-capture`, capture: { source_id: sourceId, capture_id: `${sourceId}-capture`, requested_url: `${origin}/board`, final_url: `${origin}/board`, html_sha256: hash }, control, treatment, candidate_comparison: comparison };
}
const baseline = { target_count: 4, targets: ["fixture_001", "fixture_002", "fixture_003", "fixture_004"].map((source_id) => ({ source_id })) };
const first = buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [evidence("fixture_001"), evidence("fixture_002", { origin: "https://other.test", recall: false }), evidence("fixture_004", { family: "list" })] });
const second = buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [evidence("fixture_004", { family: "list" }), evidence("fixture_002", { origin: "https://other.test", recall: false }), evidence("fixture_001")] });
assert.deepEqual(first, second);
assert.equal(first.summary.clustered_source_count, 3);
assert.equal(first.summary.capture_required_source_count, 1);
const tableCluster = first.clusters.find((cluster) => cluster.source_ids.includes("fixture_001"));
assert.deepEqual(tableCluster.source_ids, ["fixture_001", "fixture_002"]);
assert.equal(tableCluster.evidence_status_counts.ready_for_fixture, 1);
assert.equal(tableCluster.evidence_status_counts.evidence_reconciliation_required, 1);
assert.equal(tableCluster.structural_signature.url_identity_signatures[0].includes("one.test"), false);
assert.notEqual(tableCluster.cluster_id, first.clusters.find((cluster) => cluster.source_ids.includes("fixture_004")).cluster_id);
assert.deepEqual(first.unclustered, [{ source_id: "fixture_003", evidence_status: "capture_required", next_action: "capture_same_html_evidence", next_phase_queue: "same_html_capture", blocking_reason: "same_html_capture_absent" }]);

const invalid = (mutate, pattern) => { const value = clone(evidence("fixture_001")); mutate(value); assert.throws(() => buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [value] }), pattern); };
invalid((value) => { value.candidate_comparison.source_id = "wrong"; }, /source provenance/);
invalid((value) => { value.candidate_comparison.same_html_sha256 = "b".repeat(64); }, /hash provenance/);
invalid((value) => { value.control.candidates[0].source_capture_hash = "b".repeat(64); }, /source capture hash/);
invalid((value) => { value.treatment.final_url = "https://one.test/other"; }, /final_url provenance/);
invalid((value) => { value.candidate_comparison.control_candidate_count = 2; }, /arithmetic|content or SHA/);
invalid((value) => { value.candidate_comparison.comparison_sha256 = "0".repeat(64); }, /content or SHA/);
invalid((value) => { value.candidate_comparison.removed_candidate_classifications = { navigation: 1 }; }, /content or SHA/);
invalid((value) => { value.control.candidates.push(clone(value.control.candidates[0])); }, /duplicate normalized identity/);
assert.throws(() => buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [evidence("fixture_001"), evidence("fixture_001")] }), /Duplicate/);
assert.throws(() => buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [evidence("not-a-target")] }), /non-target/);
console.log("phase3_parser_remediation_cluster_tests_passed=14");
