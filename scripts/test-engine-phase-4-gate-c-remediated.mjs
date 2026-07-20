import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaValidators, validateCanonicalRecord } from "../lib/engine-phase-4/contracts.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { buildP0RemediatedFullGateCRecord, FULL_GATE_C_P0_FIELD_MAP } from "../lib/engine-phase-4/full-gate-c-remediated-adapter.mjs";
import { extractP0RemediatedCandidate } from "../lib/engine-phase-4/p0-remediated-extractor.mjs";
import { HISTORICAL_GATE_C_TIMESTAMP, P0_LIFECYCLE_TIMESTAMP, buildFullGateCBaselineDelta, report } from "./evaluate-engine-phase-4-gate-c-remediated.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const validators = createSchemaValidators();
const checks = [];
const check = (name, run) => checks.push({ name, run });

function buildFixture(fixture) {
  const baselineRecord = extractDeterministicScholarshipCandidate({
    ...fixture.evaluation_input,
    extractionContext: { extractorVersion: "1.0.0", parserContractVersion: "engine-phase-3-document-result/v1", evaluationFixtureVersion: corpus.fixture_version, extractedAt: HISTORICAL_GATE_C_TIMESTAMP },
  });
  const remediatedOutput = extractP0RemediatedCandidate({
    ...fixture.evaluation_input,
    extractionContext: { caseId: fixture.case_id, asOf: P0_LIFECYCLE_TIMESTAMP, extractedAt: P0_LIFECYCLE_TIMESTAMP },
  });
  return { baselineRecord, remediatedOutput, hybrid: buildP0RemediatedFullGateCRecord({ baselineRecord, remediatedOutput, extractedAt: HISTORICAL_GATE_C_TIMESTAMP }) };
}

check("hybrid adapter declares every overlapping P0 field explicitly", () => {
  assert.deepEqual(FULL_GATE_C_P0_FIELD_MAP, {
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

check("non-P0 fields remain byte-equivalent to the historical baseline", () => {
  const { baselineRecord, hybrid } = buildFixture(corpus.cases[4]);
  for (const name of ["title", "recruitment_cycle_label", "eligibility", "required_documents", "application_method", "source_language", "notes", "contact", "academic_term"]) {
    assert.deepEqual(hybrid.record.fields[name], baselineRecord.fields[name], name);
  }
});

check("P0 date strings become canonical date values without inference", () => {
  const { remediatedOutput, hybrid } = buildFixture(corpus.cases[4]);
  assert.equal(remediatedOutput.fields.application_start.value, "2025-04-01T10:00:00+09:00");
  assert.deepEqual(hybrid.record.fields.application_start.normalized_value, { kind: "exact_datetime", datetime: "2025-04-01T10:00:00+09:00", timezone: "+09:00", inferred: false });
  assert.equal(hybrid.record.fields.application_start.inference.is_inferred, false);
});

check("unrepresentable P0 amount fails closed and survives in extensions", () => {
  const { remediatedOutput, hybrid } = buildFixture(corpus.cases[11]);
  assert.equal(remediatedOutput.fields.support_amount.status, "present");
  assert.equal(remediatedOutput.fields.support_amount.value.kind, "applicant_requested");
  assert.equal(hybrid.record.fields.amount.value_status, "unknown");
  assert.equal(hybrid.record.fields.amount.normalized_value, null);
  assert.deepEqual(hybrid.p0_extensions.original_p0_fields.support_amount, remediatedOutput.fields.support_amount);
});

check("institution and support type are preserved in record and extensions", () => {
  const { remediatedOutput, hybrid } = buildFixture(corpus.cases[19]);
  assert.deepEqual(hybrid.p0_extensions.institution_or_campus, remediatedOutput.fields.institution_or_campus);
  assert.deepEqual(hybrid.p0_extensions.support_type, remediatedOutput.fields.support_type);
  assert.deepEqual(hybrid.record.fields.benefit_type.normalized_value, remediatedOutput.fields.support_type.value);
});

check("classification uses publishability and remediated evidence", () => {
  const { remediatedOutput, hybrid } = buildFixture(corpus.cases[0]);
  assert.equal(hybrid.record.classification.document_kind, "recruitment_notice");
  assert.equal(hybrid.record.classification.is_recruitment, remediatedOutput.classification.publishable_opportunity);
  assert.deepEqual(hybrid.record.classification.evidence_refs, remediatedOutput.classification.evidence_references.map((id) => `ev_p0_${id.replace(/^p0ev_/u, "")}`));
});

check("evidence merge preserves provenance and resolves every reference", () => {
  for (const fixture of corpus.cases) {
    const { hybrid } = buildFixture(fixture);
    const validation = validateCanonicalRecord(hybrid.record, validators);
    assert.equal(validation.valid, true, `${fixture.case_id}: ${JSON.stringify(validation.errors)}`);
    const evidence = new Set(hybrid.record.evidence.map((item) => item.evidence_id));
    for (const field of Object.values(hybrid.record.fields)) for (const reference of field.evidence_refs) assert.equal(evidence.has(reference), true, `${fixture.case_id}:${reference}`);
    for (const reference of hybrid.record.classification.evidence_refs) assert.equal(evidence.has(reference), true, `${fixture.case_id}:${reference}`);
  }
});

check("review merge is a deterministic union and publication stays disabled", () => {
  const { baselineRecord, remediatedOutput, hybrid } = buildFixture(corpus.cases[0]);
  for (const reason of baselineRecord.review.reason_codes) assert.ok(hybrid.record.review.reason_codes.includes(reason));
  for (const reason of remediatedOutput.review.reasons) assert.ok(hybrid.record.review.reason_codes.includes(reason));
  assert.equal(hybrid.record.review.required, true);
  assert.equal(hybrid.record.review.automatic_publish_allowed, false);
  assert.equal(hybrid.record.review.notification_allowed, false);
});

check("stale identity and cycle candidates are always withheld", () => {
  assert.equal(report.execution_safety.stale_program_candidate_count, 0);
  assert.equal(report.execution_safety.stale_cycle_candidate_count, 0);
  assert.equal(report.records.every((record) => record.program_identity_candidate.resolution_status !== "proposed"), true);
  assert.equal(report.records.every((record) => record.recruitment_cycle_identity_candidate.resolution_status !== "proposed"), true);
});

check("legacy raw and contract-aligned lenses remain distinct", () => {
  assert.equal(report.historical_raw_lens.legacy_status_semantic_incompatible, true);
  assert.equal(report.contract_aligned_comparable_lens.legacy_status_field_excluded_from_contract_aligned_accuracy, true);
  assert.equal(report.contract_aligned_comparable_lens.legacy_status_excluded_count, 24);
  assert.equal(report.contract_aligned_comparable_lens.lifecycle_reviewer_resolved_count, 4);
  assert.equal(report.contract_aligned_comparable_lens.comparable_field_count, 316);
});

check("baseline delta is reproducible and semantic status is not called improved", () => {
  const baseline = read("reports/engine-phase-4-gate-c-representative-evaluation.json");
  assert.deepEqual(buildFullGateCBaselineDelta(baseline, report.historical_raw_lens.metrics, report.execution_safety, report.usability, report.error_taxonomy), report.baseline_delta);
  assert.equal(report.baseline_delta.metrics.field_status_exact_accuracy.classification, "semantic_contract_changed");
  assert.equal(report.baseline_delta.metrics.normalized_exact_match.classification, "semantic_contract_changed");
});

check("corrected P0 safety and representation risks flow into full Gate C", () => {
  assert.equal(Object.values(report.contract_aligned_comparable_lens.p0_safety_metrics).every((value) => value === 0), true);
  assert.equal(report.production_shadow_risks.overclaim_count, 0);
  assert.equal(report.production_shadow_risks.representation_loss_risk_count, 3);
  assert.equal(report.production_shadow_risks.schema_gap_collapsed_to_present_count, 3);
});

check("actual OCR metrics remain separated", () => {
  assert.equal(report.ocr_boundary.parser_success_status_accepted_count, 7);
  assert.equal(report.ocr_boundary.ocr_status_accepted_count, 0);
  assert.equal(report.ocr_boundary.bbox_missing_ocr_present_claim_count, 0);
});

check("execution safety passes while handoff and Phase 5 remain closed", () => {
  assert.equal(report.execution_safety.case_count, 24);
  assert.equal(report.execution_safety.canonical_schema_valid_count, 24);
  assert.equal(report.execution_safety.evidence_integrity_count, 24);
  assert.equal(report.execution_safety.deterministic_rerun, true);
  assert.equal(report.execution_safety.unsupported_present_value_count, 0);
  assert.equal(report.decision, "CONDITIONAL PASS");
  assert.equal(report.gate_status.candidate_handoff, "NOT RUN");
  assert.equal(report.gate_status.phase5, "HOLD");
});

let passed = 0;
for (const item of checks) {
  item.run();
  passed += 1;
  console.log(`PASS ${item.name}`);
}
console.log(`${passed}/${checks.length} remediated full Gate C tests passed`);
