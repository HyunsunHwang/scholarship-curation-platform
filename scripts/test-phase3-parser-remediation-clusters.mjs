import assert from "node:assert/strict";
import { buildPhase3RemediationClusters } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";

const hash = "a".repeat(64);
const capture = (sourceId, { recallVerified = true } = {}) => ({
  schema_version: "phase2-same-html-comparison-v1",
  source_id: sourceId,
  capture_id: `${sourceId}-capture`,
  capture: { source_id: sourceId, html_sha256: hash },
  control: { capture_id: `${sourceId}-capture`, html_sha256: hash },
  treatment: {
    capture_id: `${sourceId}-capture`, html_sha256: hash,
    parser_evidence: { parser_strategy: "configured_selector", matched_list_selector: ".board tr", profile_applied: false },
    candidates: [{ canonical_url: "https://example.test/notices/view?id=123", classification: "real_notice" }],
  },
  candidate_comparison: { candidate_recall_verified: recallVerified, added_candidate_classifications: {} },
});
const baseline = { target_count: 4, targets: [{ source_id: "fixture_001" }, { source_id: "fixture_002" }, { source_id: "fixture_003" }, { source_id: "fixture_004" }] };
const first = buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [capture("fixture_001"), capture("fixture_002", { recallVerified: false }), capture("fixture_004")] });
const second = buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [capture("fixture_004"), capture("fixture_002", { recallVerified: false }), capture("fixture_001")] });
assert.deepEqual(first, second);
assert.equal(first.summary.clustered_source_count, 3);
assert.equal(first.summary.capture_required_source_count, 1);
assert.equal(first.summary.ready_for_fixture_cluster_count, 1);
assert.equal(first.summary.evidence_reconciliation_cluster_count, 1);
assert.equal(first.clusters.find((cluster) => cluster.evidence_status === "ready_for_fixture").source_ids.length, 2);
assert.deepEqual(first.unclustered, [{ source_id: "fixture_003", evidence_status: "capture_required", next_action: "capture_same_html_evidence", next_phase_queue: "same_html_capture", blocking_reason: "same_html_capture_absent" }]);
assert.throws(() => buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [capture("fixture_001"), capture("fixture_001")] }), /Duplicate/);
assert.throws(() => buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [{ ...capture("fixture_001"), capture: { source_id: "fixture_001", html_sha256: "b".repeat(64) } }] }), /hash provenance/);
assert.throws(() => buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [capture("not-a-target")] }), /non-target/);
console.log("phase3_parser_remediation_cluster_tests_passed=7");
