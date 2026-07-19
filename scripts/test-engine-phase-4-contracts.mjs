import assert from "node:assert/strict";
import {
  contractPaths,
  createSchemaValidators,
  findEvaluationCase,
  readJson,
  validateCanonicalRecord,
  validateEvaluationManifest,
} from "../lib/engine-phase-4/contracts.mjs";

const validators = createSchemaValidators();
const baseRecord = readJson(contractPaths.validRecord);
const evaluation = readJson(contractPaths.evaluationCases);
const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

function cloneRecord() {
  return structuredClone(baseRecord);
}

function errorCodes(result) {
  return new Set(result.errors.map((entry) => entry.code));
}

function expectError(record, code) {
  assert.equal(errorCodes(validateCanonicalRecord(record, validators)).has(code), true, `expected ${code}`);
}

function evidenceById(record, evidenceId) {
  return record.evidence.find((entry) => entry.evidence_id === evidenceId);
}

test("valid canonical record", () => {
  assert.equal(validateCanonicalRecord(cloneRecord(), validators).valid, true);
});

test("valid evidence references", () => {
  const result = validateCanonicalRecord(cloneRecord(), validators);
  assert.equal(result.errors.some((entry) => entry.code.includes("evidence")), false);
});

test("unknown and not_found remain distinct", () => {
  const record = cloneRecord();
  record.fields.contact = { ...record.fields.notes, value_status: "unknown" };
  const result = validateCanonicalRecord(record, validators);
  assert.equal(result.valid, true);
  assert.notEqual(record.fields.contact.value_status, record.fields.notes.value_status);
});

test("invalid enum is rejected", () => {
  const record = cloneRecord();
  record.fields.title.value_status = "invented";
  assert.equal(errorCodes(validateCanonicalRecord(record, validators)).has("schema_invalid"), true);
});

test("missing evidence is rejected", () => {
  const record = cloneRecord();
  record.fields.title.evidence_refs = [];
  assert.equal(errorCodes(validateCanonicalRecord(record, validators)).has("missing_evidence"), true);
});

test("duplicate evidence id is rejected", () => {
  const record = cloneRecord();
  record.evidence.push(structuredClone(record.evidence[0]));
  assert.equal(errorCodes(validateCanonicalRecord(record, validators)).has("duplicate_evidence_id"), true);
});

test("conflicting date range is rejected", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value = {
    kind: "date_range", start: "2026-09-01", end: "2026-08-01", timezone: "Asia/Seoul", inferred: false,
  };
  assert.equal(errorCodes(validateCanonicalRecord(record, validators)).has("invalid_date_range"), true);
});

test("invalid amount range is rejected", () => {
  const record = cloneRecord();
  record.fields.amount.normalized_value = {
    kind: "range", currency: "KRW", minimum: 3000000, maximum: 1000000, period: "semester", description: null,
  };
  assert.equal(errorCodes(validateCanonicalRecord(record, validators)).has("invalid_amount_range"), true);
});

test("unsupported invented value is rejected", () => {
  const record = cloneRecord();
  record.fields.provider.inference = { is_inferred: true, reason: null };
  assert.equal(errorCodes(validateCanonicalRecord(record, validators)).has("unsupported_invented_value"), true);
});

test("identity hierarchy contradiction is rejected", () => {
  const record = cloneRecord();
  record.recruitment_cycle_identity_candidate.program_candidate_id = "different_program";
  assert.equal(errorCodes(validateCanonicalRecord(record, validators)).has("identity_hierarchy_contradiction"), true);
});

test("same program and different cycle is represented", () => {
  const entry = findEvaluationCase(evaluation, "new_term");
  assert.equal(entry.expected.identity.program_relation, "same");
  assert.equal(entry.expected.identity.cycle_relation, "different");
});

test("same notice and changed document revision is represented", () => {
  const entry = findEvaluationCase(evaluation, "deadline_extension");
  assert.equal(entry.expected.identity.notice_relation, "same");
  assert.equal(entry.expected.identity.document_relation, "new_revision");
});

test("material deadline change is represented", () => {
  assert.equal(findEvaluationCase(evaluation, "deadline_extension").expected.material_change, "deadline_extension");
});

test("result announcement is non-recruitment", () => {
  const entry = findEvaluationCase(evaluation, "result_announcement");
  assert.equal(entry.expected.classification, "result_announcement");
  assert.equal(entry.expected.material_change, "not_applicable");
});

test("manual review required case remains fail closed", () => {
  assert.equal(findEvaluationCase(evaluation, "low_quality_ocr").expected.review_required, true);
  assert.equal(validateEvaluationManifest(evaluation, validators).valid, true);
});

test("PDF evidence with null document_id is rejected", () => {
  const record = cloneRecord();
  evidenceById(record, "ev_deadline").document_id = null;
  expectError(record, "evidence_document_identity_missing");
});

test("PDF evidence with null document_revision_id is rejected", () => {
  const record = cloneRecord();
  evidenceById(record, "ev_deadline").document_revision_id = null;
  expectError(record, "evidence_document_identity_missing");
});

test("PDF evidence with null document_hash is rejected", () => {
  const record = cloneRecord();
  evidenceById(record, "ev_deadline").document_hash = null;
  expectError(record, "evidence_document_hash_missing");
});

test("PDF evidence with null locator is rejected", () => {
  const record = cloneRecord();
  evidenceById(record, "ev_deadline").locator = null;
  expectError(record, "evidence_locator_missing");
});

test("OCR evidence without page number is rejected", () => {
  const record = cloneRecord();
  const item = evidenceById(record, "ev_deadline");
  item.source_type = "ocr_text";
  item.locator.page_number = null;
  item.locator.bounding_box = { x: 0, y: 0, width: 100, height: 20, unit: "pixel" };
  expectError(record, "evidence_ocr_locator_missing");
});

test("OCR evidence without bounding box is rejected", () => {
  const record = cloneRecord();
  const item = evidenceById(record, "ev_deadline");
  item.source_type = "ocr_text";
  item.locator.bounding_box = null;
  expectError(record, "evidence_ocr_locator_missing");
});

test("table evidence without table coordinates is rejected", () => {
  const record = cloneRecord();
  evidenceById(record, "ev_amount").locator.table_coordinates = null;
  expectError(record, "evidence_table_coordinates_missing");
});

test("HTML evidence without source notice ID is rejected", () => {
  const record = cloneRecord();
  evidenceById(record, "ev_title").source_notice_id = null;
  expectError(record, "evidence_source_notice_missing");
});

test("manual annotation without annotation ID is rejected", () => {
  const record = cloneRecord();
  const item = evidenceById(record, "ev_title");
  item.source_type = "manual_annotation";
  item.manual_annotation_id = null;
  item.inference_reason = "Adjudicated synthetic label";
  expectError(record, "manual_annotation_identity_missing");
});

test("manual annotation without inference reason is rejected", () => {
  const record = cloneRecord();
  const item = evidenceById(record, "ev_title");
  item.source_type = "manual_annotation";
  item.manual_annotation_id = "annotation_synthetic_1";
  item.inference_reason = null;
  expectError(record, "manual_annotation_reason_missing");
});

test("text evidence with empty raw and normalized text is rejected", () => {
  const record = cloneRecord();
  const item = evidenceById(record, "ev_title");
  item.raw_text = "";
  item.normalized_text = "";
  expectError(record, "evidence_text_missing");
});

test("exact_date without date is rejected", () => {
  const record = cloneRecord();
  record.fields.application_start.normalized_value.date = null;
  expectError(record, "exact_date_value_missing");
});

test("exact_datetime without datetime is rejected", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value.datetime = null;
  expectError(record, "exact_datetime_value_missing");
});

test("date_range without start is rejected", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value = {
    kind: "date_range", start: null, end: "2026-08-31", timezone: "Asia/Seoul", inferred: false,
  };
  expectError(record, "date_range_boundary_missing");
});

test("date_range without end is rejected", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value = {
    kind: "date_range", start: "2026-08-01", end: null, timezone: "Asia/Seoul", inferred: false,
  };
  expectError(record, "date_range_boundary_missing");
});

test("recurring date without recurrence is rejected", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value = {
    kind: "recurring", recurrence: null, timezone: "Asia/Seoul", inferred: false,
  };
  expectError(record, "recurrence_value_missing");
});

test("relative date without relative text is rejected", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value = {
    kind: "relative_text_only", relative_text: null, timezone: "Asia/Seoul", inferred: false,
  };
  expectError(record, "relative_date_text_missing");
});

test("exact amount without amount is rejected", () => {
  const record = cloneRecord();
  record.fields.amount.normalized_value.amount = null;
  expectError(record, "exact_amount_value_missing");
});

test("range amount without minimum is rejected", () => {
  const record = cloneRecord();
  record.fields.amount.normalized_value = {
    kind: "range", currency: "KRW", minimum: null, maximum: 2000000, period: "semester", description: null,
  };
  expectError(record, "amount_range_boundary_missing");
});

test("range amount without maximum is rejected", () => {
  const record = cloneRecord();
  record.fields.amount.normalized_value = {
    kind: "range", currency: "KRW", minimum: 1000000, maximum: null, period: "semester", description: null,
  };
  expectError(record, "amount_range_boundary_missing");
});

test("non-cash amount without description is rejected", () => {
  const record = cloneRecord();
  record.fields.amount.normalized_value = {
    kind: "non_cash", currency: null, period: "not_applicable", description: null,
  };
  expectError(record, "non_cash_description_missing");
});

test("classification with empty evidence is rejected", () => {
  const record = cloneRecord();
  record.classification.evidence_refs = [];
  expectError(record, "classification_evidence_missing");
});

test("proposed program candidate with empty evidence is rejected", () => {
  const record = cloneRecord();
  record.program_identity_candidate.resolution_status = "proposed";
  record.program_identity_candidate.evidence_refs = [];
  expectError(record, "program_candidate_evidence_missing");
});

test("proposed cycle candidate with empty evidence is rejected", () => {
  const record = cloneRecord();
  record.recruitment_cycle_identity_candidate.resolution_status = "proposed";
  record.recruitment_cycle_identity_candidate.evidence_refs = [];
  expectError(record, "cycle_candidate_evidence_missing");
});

test("material change with empty evidence is rejected", () => {
  const record = cloneRecord();
  record.material_changes.push({
    event_id: "change_deadline_1",
    from_revision_id: "opportunity_revision_synthetic_0",
    to_revision_id: "opportunity_revision_synthetic_1",
    change_type: "deadline_extension",
    materiality: "material",
    notification_kind: "changed_opportunity",
    evidence_refs: [],
    review_required: false,
  });
  expectError(record, "material_change_evidence_missing");
});

test("valid PDF evidence passes", () => {
  assert.equal(validateCanonicalRecord(cloneRecord(), validators).valid, true);
});

test("valid OCR evidence passes", () => {
  const record = cloneRecord();
  const item = evidenceById(record, "ev_deadline");
  item.source_type = "ocr_text";
  item.locator.bounding_box = { x: 0, y: 0, width: 100, height: 20, unit: "pixel" };
  assert.equal(validateCanonicalRecord(record, validators).valid, true);
});

test("valid exact date passes", () => {
  assert.equal(validateCanonicalRecord(cloneRecord(), validators).valid, true);
});

test("valid date range passes", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value = {
    kind: "date_range", start: "2026-08-01", end: "2026-08-31", timezone: "Asia/Seoul", inferred: false,
  };
  assert.equal(validateCanonicalRecord(record, validators).valid, true);
});

test("valid exact amount passes", () => {
  assert.equal(validateCanonicalRecord(cloneRecord(), validators).valid, true);
});

test("valid non-cash amount passes", () => {
  const record = cloneRecord();
  record.fields.amount.normalized_value = {
    kind: "non_cash", currency: null, period: "not_applicable", description: "Mentoring and housing support",
  };
  assert.equal(validateCanonicalRecord(record, validators).valid, true);
});

test("unresolved identity candidate may omit evidence only with review required", () => {
  const record = cloneRecord();
  record.program_identity_candidate.resolution_status = "unresolved";
  record.program_identity_candidate.evidence_refs = [];
  record.review.required = true;
  assert.equal(validateCanonicalRecord(record, validators).valid, true);
  record.review.required = false;
  expectError(record, "unresolved_identity_review_missing");
});

test("empty attachment metadata evidence is rejected", () => {
  const record = cloneRecord();
  const item = evidenceById(record, "ev_title");
  item.source_type = "attachment_metadata";
  item.raw_text = null;
  item.normalized_text = null;
  item.attachment_url = null;
  item.metadata = null;
  expectError(record, "evidence_metadata_missing");
});

test("meaningful attachment metadata evidence passes", () => {
  const record = cloneRecord();
  const item = evidenceById(record, "ev_title");
  item.source_type = "attachment_metadata";
  item.raw_text = null;
  item.normalized_text = null;
  item.attachment_url = null;
  item.metadata = { filename: "guide.pdf" };
  assert.equal(validateCanonicalRecord(record, validators).valid, true);
});

test("open-ended date without start or relative meaning is rejected", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value = {
    kind: "open_ended", timezone: "Asia/Seoul", inferred: false,
  };
  expectError(record, "open_ended_value_missing");
});

test("open-ended date with relative meaning passes", () => {
  const record = cloneRecord();
  record.fields.application_deadline.normalized_value = {
    kind: "open_ended", relative_text: "until funds are exhausted", timezone: "Asia/Seoul", inferred: false,
  };
  assert.equal(validateCanonicalRecord(record, validators).valid, true);
});

let passed = 0;
for (const entry of tests) {
  try {
    await entry.run();
    passed += 1;
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    console.error(`FAIL ${entry.name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}
console.log(`Engine Phase 4 contract tests: ${passed}/${tests.length} PASS`);
if (passed !== tests.length) process.exitCode = 1;
