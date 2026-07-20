import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adaptP0RemediatedOutputForAudit, P0_REMEDIATED_AUDIT_FIELD_MAP } from "../lib/engine-phase-4/p0-remediated-audit-adapter.mjs";
import { buildBaselineDelta, countBboxMissingOcrPresentClaims, evaluateProductionShadow, mapExtractorStatusToShadow, report } from "./evaluate-engine-phase-4-gate-c-p0-remediated.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const checks = [];
const check = (name, run) => checks.push({ name, run });
const outputByCase = new Map(report.outputs.map((output) => [output.case_id, output]));

check("adapter exposes the complete explicit field map", () => {
  assert.deepEqual(P0_REMEDIATED_AUDIT_FIELD_MAP, {
    program_name: "scholarship_program_name",
    provider: "provider",
    institution_or_campus: "host_institution",
    application_start: "application_start",
    application_deadline: "application_deadline",
    lifecycle_status: "status",
    application_url: "application_url",
    support_type: "benefit_type",
    support_amount: "amount",
  });
});

check("adapter preserves status value evidence and non-inference", () => {
  const source = outputByCase.get("p4c_005_miraero_second");
  const adapted = adaptP0RemediatedOutputForAudit(source);
  for (const [sourceName, targetName] of Object.entries(P0_REMEDIATED_AUDIT_FIELD_MAP)) {
    assert.equal(adapted.fields[targetName].value_status, source.fields[sourceName].status);
    assert.deepEqual(adapted.fields[targetName].normalized_value, source.fields[sourceName].value);
    assert.deepEqual(adapted.fields[targetName].evidence_refs, source.fields[sourceName].evidence_references);
    assert.equal(adapted.fields[targetName].inference.is_inferred, false);
  }
});

check("adapter preserves date and datetime strings verbatim", () => {
  const source = outputByCase.get("p4c_005_miraero_second");
  const adapted = adaptP0RemediatedOutputForAudit(source);
  assert.equal(adapted.fields.application_start.normalized_value, source.fields.application_start.value);
  assert.equal(adapted.fields.application_deadline.normalized_value, source.fields.application_deadline.value);
  assert.match(adapted.fields.application_start.normalized_value, /T10:00:00\+09:00$/u);
});

check("adapter maps publishability rather than recomputing recruitment", () => {
  const source = structuredClone(outputByCase.get("p4c_001_student_affairs_special"));
  source.classification.publishable_opportunity = false;
  const adapted = adaptP0RemediatedOutputForAudit(source);
  assert.equal(source.classification.document_kind, "recruitment_notice");
  assert.equal(adapted.classification.is_recruitment, false);
  assert.deepEqual(adapted.classification.evidence_refs, source.classification.evidence_references);
});

check("adapter preserves schema gap and unsafe statuses", () => {
  const source = structuredClone(outputByCase.get("p4c_020_uic_supporters_table"));
  source.fields.provider = { status: "ambiguous", value: null, evidence_references: ["a"] };
  source.fields.institution_or_campus = { status: "conflicting", value: null, evidence_references: ["b"] };
  source.fields.application_url = { status: "unknown", value: null, evidence_references: [] };
  const adapted = adaptP0RemediatedOutputForAudit(source);
  assert.equal(adapted.fields.amount.value_status, "schema_expressiveness_gap");
  assert.equal(adapted.fields.provider.value_status, "ambiguous");
  assert.equal(adapted.fields.host_institution.value_status, "conflicting");
  assert.equal(adapted.fields.application_url.value_status, "unknown");
  assert.equal(adapted.review.required, source.review.required);
});

check("shadow status mapping fails unsafe statuses closed", () => {
  for (const status of ["unknown", "ambiguous", "conflicting"]) assert.equal(mapExtractorStatusToShadow(status), "unresolved");
  for (const status of ["present", "not_found", "not_applicable", "schema_expressiveness_gap"]) assert.equal(mapExtractorStatusToShadow(status), status);
});

check("all official outputs pass schema and semantic validation", () => {
  assert.equal(report.outputs.length, 24);
  assert.equal(report.execution.schema_valid_count, 24);
  assert.equal(report.execution.semantic_valid_count, 24);
  assert.equal(report.validation.every((item) => item.schema_valid && item.semantic_valid), true);
});

check("official rerun and evidence safety pass", () => {
  assert.equal(report.execution.deterministic_rerun_match, true);
  assert.equal(report.execution.unsupported_present_claim_count, 0);
  assert.equal(report.execution.missing_evidence_reference_count, 0);
  assert.equal(report.execution.source_url_substitution_count, 0);
  assert.equal(report.execution.automatic_publish_allowed_count, 0);
});

check("known-case safety checks all pass", () => assert.equal(Object.values(report.known_case_checks).every(Boolean), true));

check("historical frozen denominator remains unchanged", () => {
  assert.deepEqual(report.denominator_policy, {
    case_count: 24,
    p0_field_count: 9,
    total_concept_slot_count: 216,
    resolved_p0_field_count: 14,
    pending_p0_field_count: 198,
    unresolved_p0_field_count: 4,
    resolved_safety_field_count: 10,
    production_source_shadow_included: false,
  });
});

check("baseline delta is computed from the tracked baseline", () => {
  const baseline = read("reports/engine-phase-4-gate-c-p0.json");
  assert.deepEqual(buildBaselineDelta(baseline, report.frozen_reviewer_resolved), report.baseline_delta);
  assert.equal(report.baseline_delta.document_kind_exact.classification, "improved");
  assert.equal(report.baseline_delta.categories.application_url_exact.classification, "not_comparable");
});

check("production review remains a separate 19-case 171-slot shadow", () => {
  const review = read("fixtures/engine-phase-4-gate-c-p0/production-source-review.json");
  assert.deepEqual(evaluateProductionShadow(report.outputs, review), report.production_source_shadow);
  assert.equal(report.production_source_shadow.reviewed_case_count, 19);
  assert.equal(report.production_source_shadow.concept_slot_count, 171);
  assert.equal(report.production_source_shadow.included_in_frozen_correctness_denominator, false);
});

check("shadow overclaims and safe fail-close use distinct taxonomies", () => {
  assert.equal(report.production_source_shadow.overclaim_count, 0);
  assert.ok(report.production_source_shadow.safe_fail_closed_count > 0);
  const mismatches = report.production_source_shadow.case_mismatches.flatMap((item) => item.mismatches);
  assert.equal(mismatches.filter((item) => item.overclaim).length, report.production_source_shadow.overclaim_count);
  assert.equal(mismatches.filter((item) => item.safe_fail_closed).length, report.production_source_shadow.safe_fail_closed_count);
  assert.ok(report.production_source_shadow.schema_gap_collapsed_to_present_count > 0);
  assert.equal(report.production_source_shadow.representation_loss_risk_count, report.production_source_shadow.schema_gap_collapsed_to_present_count);
  assert.ok(report.production_source_shadow.schema_gap_collapsed_case_fields.some((item) => item.case_id === "p4c_017_uic_2025_fall" && item.field_name === "support_type"));
});

check("OCR accepted and missing-bbox claim counts are independently computed", () => {
  assert.equal(report.ocr_boundary.parser_success_status_accepted_count, 7);
  assert.equal(report.ocr_boundary.ocr_status_accepted_count, 0);
  assert.deepEqual(countBboxMissingOcrPresentClaims(report.outputs), []);
  const mutation = structuredClone(report.outputs);
  const target = mutation.find((output) => Object.values(output.fields).some((field) => field.status === "present"));
  const [fieldName, field] = Object.entries(target.fields).find(([, value]) => value.status === "present");
  const evidence = target.evidence_references.find((item) => field.evidence_references.includes(item.evidence_id));
  evidence.source_type = "ocr_text";
  evidence.locator = `document:mutation:block:0:page:1:bbox:none`;
  assert.deepEqual(countBboxMissingOcrPresentClaims(mutation).map((item) => [item.case_id, item.field_name]), [[target.case_id, fieldName]]);
});

check("baseline exact dates and publishability do not regress", () => {
  assert.equal(report.exact_regressions.critical.length, 0);
  const results = new Map(report.frozen_reviewer_resolved.reviewer_resolved_field_results.map((item) => [`${item.case_id}/${item.field_name}`, item]));
  for (const key of [
    "p4c_005_miraero_second/application_start",
    "p4c_005_miraero_second/application_deadline",
    "p4c_004_national_work_result/publishable_opportunity",
  ]) assert.equal(results.get(key).exact, true, key);
});

check("decision follows mandatory safety and keeps later gates closed", () => {
  assert.equal(report.mandatory_safety_passed, true);
  assert.equal(report.decision, "CONDITIONAL PASS");
  assert.equal(report.official_full_gate_c_reevaluation_completed, false);
  assert.equal(report.candidate_handoff_test_completed, false);
  assert.equal(report.full_gate_c_status, "HOLD");
  assert.equal(report.phase5_status, "HOLD");
});

let passed = 0;
for (const item of checks) {
  item.run();
  passed += 1;
  console.log(`PASS ${item.name}`);
}
console.log(`${passed}/${checks.length} official P0 remediated evaluator tests passed`);
