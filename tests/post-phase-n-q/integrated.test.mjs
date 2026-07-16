import assert from "node:assert/strict";
import fs from "node:fs";

const report = JSON.parse(
  fs.readFileSync(
    "reports/post-phase-n-q/integrated-rehearsal.json",
    "utf8",
  ),
);
assert.equal(report.evidence_kind, "database_nonproduction");
assert.equal(report.input_evidence_kind, "fixture");
assert.equal(report.fixture_reported_as_live, false);
assert.equal(report.graph_ingest_passed, true);
assert.equal(report.approve_e2e_passed, true);
assert.equal(report.reject_e2e_passed, true);
assert.equal(report.logical_recovery_passed, true);
assert.equal(report.deterministic_reapply_passed, true);
assert.equal(report.final_containment_passed, true);
assert.equal(report.review_event_mutation_count, 0);
assert.equal(report.duplicate_notice_count, 0);
assert.equal(report.duplicate_occurrence_count, 0);
assert.equal(report.duplicate_projection_count, 0);
assert.equal(report.unrelated_row_change_count, 0);
assert.equal(report.automatic_public_publish_count, 0);
assert.equal(report.production_access_performed, false);
console.log(JSON.stringify({
  passed: true,
  graph_review_projection_recovery: true,
  duplicate_count: 0,
  unrelated_row_change_count: 0,
  final_public_leakage_count: 0,
}, null, 2));
