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
