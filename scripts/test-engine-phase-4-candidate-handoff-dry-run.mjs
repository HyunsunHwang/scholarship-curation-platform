import assert from "node:assert/strict";
import { evaluateCandidateHandoffGate } from "../lib/engine-phase-4/candidate-handoff-gate.mjs";
import { buildCandidateHandoffReadModel } from "../lib/engine-phase-4/candidate-handoff-read-model-adapter.mjs";
import { report } from "./run-engine-phase-4-candidate-handoff-dry-run.mjs";

const checks = [];
const check = (name, run) => checks.push({ name, run });
const byCase = new Map(report.results.map((item) => [item.case_id, item]));

check("24 cases reconcile across mutually exclusive handoff states", () => {
  assert.equal(report.reconciliation.valid, true);
  assert.equal(report.reconciliation.reconciled_count, 24);
  assert.equal(report.metrics.excluded_non_opportunity_count + report.metrics.deferred_relation_resolution_count
    + report.metrics.blocked_count + report.metrics.needs_review_count + report.metrics.clean_count, 24);
});

check("standalone opportunity denominator is independent of all-case usability", () => {
  assert.equal(report.metrics.input_case_count, 24);
  assert.equal(report.metrics.standalone_opportunity_scope_count, 16);
  assert.equal(report.metrics.clean_count, 0);
  assert.equal(report.metrics.phase5_auto_eligible_count, 0);
});

check("terminal and guidance documents are excluded without candidates", () => {
  for (const caseId of ["p4c_004_national_work_result", "p4c_008_cau_welfare_result_2025_1", "p4c_009_cau_welfare_result_2024_2", "p4c_024_dean_recommendation_guidance"]) {
    const item = byCase.get(caseId);
    assert.equal(item.handoff_status, "excluded_non_opportunity", caseId);
    assert.equal(item.candidate_output_created, false, caseId);
  }
});

check("correction notices are deferred without standalone candidates", () => {
  for (const caseId of ["p4c_003_hope_ladder_extension", "p4c_006_gwangsan_extension"]) {
    const item = byCase.get(caseId);
    assert.equal(item.handoff_status, "deferred_relation_resolution", caseId);
    assert.equal(item.candidate_output_created, false, caseId);
  }
});

check("unknown and missing-source cases fail closed", () => {
  assert.equal(byCase.get("p4c_013_history_growth_table").handoff_status, "blocked");
  assert.equal(byCase.get("p4c_018_uic_samsung_updated").handoff_status, "blocked");
  assert.equal(byCase.get("p4c_001_student_affairs_special").reason_codes.includes("source_resolution_missing"), true);
  assert.equal(report.results.filter((item) => item.handoff_status === "blocked").every((item) => !item.candidate_output_created), true);
});

check("unresolved identity and representation loss cannot become clean", () => {
  assert.equal(report.metrics.program_identity_unresolved_count, 24);
  assert.equal(report.metrics.cycle_identity_unresolved_count, 24);
  assert.equal(report.results.filter((item) => item.handoff_status === "needs_review").every((item) => item.candidate_output_created && !item.clean_apply_allowed), true);
  assert.equal(byCase.get("p4c_012_history_central_love").reason_codes.includes("representation_loss_risk"), true);
});

check("positive in-memory clean path works without enabling publication", () => {
  assert.equal(report.positive_clean_path.included_in_actual_metrics, false);
  assert.equal(report.positive_clean_path.schema_valid, true);
  assert.equal(report.positive_clean_path.passed, true);
  assert.equal(report.positive_clean_path.result.handoff_status, "clean");
  assert.equal(report.positive_clean_path.result.clean_apply_allowed, true);
  assert.equal(report.positive_clean_path.result.automatic_publish_allowed, false);
  assert.equal(report.positive_clean_path.result.notification_allowed, false);
});

check("all required negative mutation paths pass", () => assert.equal(Object.values(report.required_negative_paths).every(Boolean), true));

check("automatic publication mutation is blocked by the pure gate", () => {
  const record = structuredClone(report.review_candidates[0].evidence_json);
  const canonical = structuredClone(report.results.find((item) => item.read_model).read_model.evidence_json.identity);
  assert.ok(record);
  assert.ok(canonical.program);
  const minimalRecord = {
    classification: { document_kind: "recruitment_notice", is_recruitment: true },
    evidence: [{ evidence_id: "ev_test" }],
    fields: {},
    program_identity_candidate: { ...canonical.program, resolution_status: "unresolved", evidence_refs: [] },
    recruitment_cycle_identity_candidate: { ...canonical.cycle, resolution_status: "unresolved", evidence_refs: [] },
    review: { required: false, reason_codes: [], automatic_publish_allowed: true, notification_allowed: false },
  };
  const result = evaluateCandidateHandoffGate({
    record: minimalRecord,
    sourceResolution: { resolution_status: "resolved", source_id: "test" },
    terminalNonOpportunity: false,
    relationResolutionRequired: false,
    opportunityKind: "scholarship",
    canonicalSchemaValid: false,
    evidenceIntegrityValid: true,
    unsupportedPresentCount: 0,
    representationLossRiskCount: 0,
  });
  assert.equal(result.handoff_status, "blocked");
  assert.ok(result.reason_codes.includes("automatic_publication_enabled"));
});

check("read-model adapter refuses a candidate without resolved source", () => {
  const item = report.results.find((result) => result.read_model);
  assert.throws(() => buildCandidateHandoffReadModel({
    record: { source_notice_identity: {} },
    sourceResolution: { resolution_status: "missing", source_id: null },
    handoffResult: { candidate_output_created: true },
    p0Extensions: {},
    conversionDiagnostics: [],
    fullGateCIdentity: {},
    fixedTimestamp: report.generated_at,
  }), /exactly resolved source/u);
  assert.ok(item.read_model.evidence_json.handoff_gate_result);
});

check("review candidates contain required local read-model evidence", () => {
  assert.equal(report.review_candidates.length, report.metrics.candidate_output_count);
  for (const item of report.review_candidates) {
    for (const field of ["source_id", "source_key_snapshot", "canonical_key", "title", "original_url", "normalized_url", "body_text", "published_at", "review_status", "body_quality", "duplicate_status", "program_identity_status", "cycle_identity_status", "document_kind", "publishable_opportunity", "evidence_json", "created_at", "updated_at"]) {
      assert.equal(Object.hasOwn(item, field), true, field);
    }
    assert.equal(item.review_status, "needs_review");
    assert.ok(item.evidence_json.source_resolution);
    assert.ok(item.evidence_json.full_gate_c_report_identity);
  }
});

check("dry-run is deterministic and side-effect free", () => {
  assert.equal(report.deterministic_rerun_match, true);
  assert.equal(report.metrics.candidate_write_plan_count, 0);
  assert.equal(report.metrics.database_write_count, 0);
  assert.equal(report.metrics.automatic_publish_count, 0);
  assert.equal(report.metrics.notification_count, 0);
  assert.equal(Object.values(report.safety).every((value) => value === false || value === 0), true);
});

check("closeout grants only limited Phase 5 entry", () => {
  assert.equal(report.status, "LIMITED ENTRY PASS");
  assert.equal(report.decisions.candidate_handoff_safety, "PASS");
  assert.equal(report.decisions.limited_phase5_entry, "PASS");
  assert.match(report.gate_status.phase5_scope, /read-only/u);
  assert.match(report.gate_status.phase5_scope, /no production write/u);
});

let passed = 0;
for (const item of checks) {
  item.run();
  passed += 1;
  console.log(`PASS ${item.name}`);
}
console.log(`${passed}/${checks.length} candidate handoff dry-run tests passed`);
