import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { validateP0RemediationRecord } from "../lib/engine-phase-4/p0-remediation-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const schema = read("schemas/engine/phase-4-p0-remediation-output.schema.json");
const examples = read("fixtures/engine-phase-4-p0-remediation-contract/examples.json");
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const schemaValidator = ajv.compile(schema);
const byScenario = Object.fromEntries(examples.examples.map((item) => [item.scenario, item.output]));
const tests = [];
const test = (name, run) => tests.push({ name, run });
const clone = (value) => structuredClone(value);
const validate = (record) => validateP0RemediationRecord(record, schemaValidator);
const expectInvalid = (record, code) => assert.equal(validate(record).errors.some((item) => item.code === code), true, `${code}: ${JSON.stringify(validate(record).errors)}`);

test("all contract fixtures are valid", () => {
  for (const example of examples.examples) assert.equal(validate(example.output).valid, true, example.scenario);
});

test("result announcement cannot be publishable", () => {
  const record = clone(byScenario.result_announcement);
  record.classification.publishable_opportunity = true;
  assert.equal(validate(record).valid, false);
});

test("guidance terminal fields stop downstream extraction", () => {
  const record = clone(byScenario.application_support_guidance);
  record.fields.program_name = { status: "present", value: "invented", evidence_references: [record.evidence_references[0].evidence_id] };
  expectInvalid(record, "terminal_field_not_applicable");
});

test("standalone correction remains non-publishable and relation-dependent", () => {
  const record = clone(byScenario.standalone_correction_notice);
  record.classification.relation_resolution_required = false;
  expectInvalid(record, "correction_relation_rule");
});

test("updated existing page requires revision note", () => {
  const record = clone(byScenario.updated_existing_recruitment_page);
  record.classification.revision_note = null;
  assert.equal(validate(record).valid, false);
});

test("document-kind value cannot enter lifecycle", () => {
  const record = clone(byScenario.normal_recruitment_notice);
  record.fields.lifecycle_status.value = "recruitment_notice";
  assert.equal(validate(record).valid, false);
});

test("application start cannot follow deadline", () => {
  const record = clone(byScenario.normal_recruitment_notice);
  record.fields.application_start.value = "2026-08-01T09:00:00+09:00";
  expectInvalid(record, "invalid_application_window");
});

test("ambiguous date roles cannot produce closed lifecycle", () => {
  const record = clone(byScenario.ambiguous_application_date_role);
  record.fields.lifecycle_status = { status: "present", value: "closed", evidence_references: [record.evidence_references[0].evidence_id] };
  expectInvalid(record, "unsafe_lifecycle_derivation");
});

test("source detail URL is not an application URL", () => {
  const record = clone(byScenario.normal_recruitment_notice);
  record.fields.application_url.value = record.source.canonical_url;
  expectInvalid(record, "source_url_used_as_application_url");
});

test("missing evidence reference fails closed", () => {
  const record = clone(byScenario.normal_recruitment_notice);
  record.fields.provider.evidence_references = ["missing_ev"];
  expectInvalid(record, "missing_evidence_reference");
});

test("provider and posting organization remain independently representable", () => {
  const record = clone(byScenario.normal_recruitment_notice);
  assert.notEqual(record.fields.provider.value, record.fields.posting_organization.value);
  assert.equal(validate(record).valid, true);
});

test("exact amount requires exact_amount", () => {
  const record = clone(byScenario.normal_recruitment_notice);
  delete record.fields.support_amount.value.exact_amount;
  expectInvalid(record, "exact_amount_missing");
});

test("maximum cap requires maximum_amount and is not exact", () => {
  const record = clone(byScenario.maximum_cap_amount);
  assert.equal(record.fields.support_amount.value.kind, "maximum_cap");
  delete record.fields.support_amount.value.maximum_amount;
  expectInvalid(record, "maximum_amount_missing");
});

test("invalid amount range fails", () => {
  const record = clone(byScenario.range_amount);
  record.fields.support_amount.value.minimum_amount = 2000000;
  expectInvalid(record, "invalid_amount_range");
});

test("target tiers require labels", () => {
  const record = clone(byScenario.tiered_by_target_amount);
  record.fields.support_amount.value.components[0].target_label = null;
  expectInvalid(record, "target_label_missing");
});

test("complex amount cannot become a first-pass present scalar", () => {
  const record = clone(byScenario.tiered_by_target_amount);
  record.fields.support_amount.status = "present";
  expectInvalid(record, "complex_amount_not_schema_gap");
});

test("schema gap cannot be relabelled ambiguous", () => {
  const record = clone(byScenario.tiered_by_target_amount);
  record.fields.support_amount = { status: "ambiguous", value: null, evidence_references: [record.evidence_references[0].evidence_id] };
  expectInvalid(record, "schema_gap_status_lost");
});

test("applicant-requested amount cannot become not_found", () => {
  const record = clone(byScenario.applicant_requested_amount);
  record.fields.support_amount = { status: "not_found", value: null, evidence_references: [] };
  expectInvalid(record, "applicant_requested_semantics_lost");
});

test("paid activity requires feed-partition review", () => {
  const record = clone(byScenario.paid_student_activity);
  record.review.reasons = record.review.reasons.filter((item) => item !== "paid_activity_feed_partition_required");
  expectInvalid(record, "paid_activity_partition_review_missing");
});

test("automatic publication cannot be enabled", () => {
  const record = clone(byScenario.normal_recruitment_notice);
  record.review.automatic_publish_allowed = true;
  assert.equal(validate(record).valid, false);
});

for (const item of tests) {
  item.run();
  console.log(`PASS ${item.name}`);
}
console.log("ENGINE PHASE 4 P0 REMEDIATION CONTRACT TESTS: PASS");
console.log(`tests=${tests.length}/${tests.length}`);
