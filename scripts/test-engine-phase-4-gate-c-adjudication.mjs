import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  buildInitialAdjudicationDecisions,
  deepClone,
  validateAdjudicationPacket,
} from "../lib/engine-phase-4/gate-c-adjudication.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const manifest = read("fixtures/engine-phase-4-representative-gold/manifest.json");
const relations = read("fixtures/engine-phase-4-representative-gold/relations.json");
const schema = read("schemas/engine/phase-4-gate-c-adjudication.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);
const initial = buildInitialAdjudicationDecisions(corpus, relations, manifest.selection_manifest_hash);
const validate = (decisions) => validateAdjudicationPacket({ corpus, relations, manifest, decisions, validateSchema });
const reviewedAt = "2026-07-19T12:30:00Z";
const reviewerRole = "independent_human_reviewer";
const firstField = (decisions) => decisions.cases[0].fields[1];
const correctedGold = (field) => ({
  status: field.candidate_gold.status,
  normalized_value: `${String(field.candidate_gold.normalized_value)} independently corrected`,
  evidence_ids: [...field.candidate_gold.evidence_ids],
});
const expectFailure = (name, mutate, predicate) => {
  const sample = deepClone(initial);
  mutate(sample);
  const result = validate(sample);
  assert.equal(predicate(result), true, name);
  console.log(`PASS ${name}`);
};

const pending = validate(initial);
assert.equal(pending.schema_valid, true);
assert.equal(pending.packet_complete, true);
assert.equal(pending.independent_review_complete, false);
console.log("PASS 24 pending decisions are structurally valid and incomplete");

expectFailure("missing case fails", (sample) => sample.cases.pop(), (result) => !result.packet_complete);
expectFailure("unknown case fails", (sample) => { const extra = deepClone(sample.cases[0]); extra.case_id = "p4c_unknown_case"; sample.cases.push(extra); }, (result) => !result.packet_complete);
expectFailure("duplicate case fails", (sample) => { sample.cases[23] = deepClone(sample.cases[0]); }, (result) => !result.packet_complete);
expectFailure("invalid decision enum fails", (sample) => { firstField(sample).decision = "auto_approved"; }, (result) => !result.schema_valid);
expectFailure("corrected without reason fails", (sample) => { const field = firstField(sample); field.decision = "corrected"; field.adjudicated_gold = correctedGold(field); field.reviewer_role = reviewerRole; field.reviewed_at = reviewedAt; }, (result) => !result.schema_valid || result.semantic_errors.length > 0);
expectFailure("corrected without adjudicated value fails", (sample) => { const field = firstField(sample); field.decision = "corrected"; field.review_reason = "Independent correction."; field.reviewer_role = reviewerRole; field.reviewed_at = reviewedAt; }, (result) => !result.schema_valid || result.semantic_errors.length > 0);
expectFailure("corrected without evidence fails", (sample) => { const field = firstField(sample); field.decision = "corrected"; field.adjudicated_gold = { ...correctedGold(field), evidence_ids: [] }; field.review_reason = "Independent correction."; field.reviewer_role = reviewerRole; field.reviewed_at = reviewedAt; }, (result) => !result.schema_valid || result.semantic_errors.length > 0);
expectFailure("unresolved without reason fails", (sample) => { const field = firstField(sample); field.decision = "unresolved"; field.adjudicated_gold = { status: "unknown", normalized_value: null, evidence_ids: [] }; field.reviewer_role = reviewerRole; field.reviewed_at = reviewedAt; }, (result) => !result.schema_valid || result.semantic_errors.length > 0);
expectFailure("approved without reviewer role fails", (sample) => { const field = firstField(sample); field.decision = "approved"; field.reviewed_at = reviewedAt; }, (result) => !result.schema_valid || result.semantic_errors.length > 0);
expectFailure("automated reviewer role fails", (sample) => { const field = firstField(sample); field.decision = "approved"; field.reviewer_role = "automated_reviewer"; field.reviewed_at = reviewedAt; }, (result) => !result.schema_valid || result.semantic_errors.length > 0);
expectFailure("reviewed decision without timestamp fails", (sample) => { const field = firstField(sample); field.decision = "approved"; field.reviewer_role = reviewerRole; }, (result) => !result.schema_valid || result.semantic_errors.length > 0);

const p0Pending = deepClone(initial);
p0Pending.adjudication_status = "in_review";
for (const caseDecision of p0Pending.cases) {
  caseDecision.decision = "approved";
  caseDecision.reviewer_role = reviewerRole;
  caseDecision.reviewed_at = reviewedAt;
  for (const field of caseDecision.fields.filter((item) => item.priority !== "P0")) {
    field.decision = "approved";
    field.reviewer_role = reviewerRole;
    field.reviewed_at = reviewedAt;
  }
  for (const partial of caseDecision.partial_decisions) {
    partial.decision = "approved";
    partial.adjudicated_partial_gold = { targets: ["independently reviewed synthetic target"] };
    partial.reviewer_role = reviewerRole;
    partial.reviewed_at = reviewedAt;
  }
}
const p0PendingResult = validate(p0Pending);
assert.equal(p0PendingResult.schema_valid, true);
assert.equal(p0PendingResult.completion_checks.all_cases_terminal, true);
assert.equal(p0PendingResult.completion_checks.all_p0_terminal, false);
assert.equal(p0PendingResult.independent_review_complete, false);
console.log("PASS completed cases with pending P0 fields remain incomplete");

const completed = deepClone(initial);
completed.adjudication_status = "completed";
for (const caseDecision of completed.cases) {
  caseDecision.decision = "approved";
  caseDecision.reviewer_role = reviewerRole;
  caseDecision.reviewed_at = reviewedAt;
  for (const field of caseDecision.fields) {
    field.decision = "approved";
    field.reviewer_role = reviewerRole;
    field.reviewed_at = reviewedAt;
  }
  for (const partial of caseDecision.partial_decisions) {
    partial.decision = "approved";
    partial.adjudicated_partial_gold = { targets: ["independently reviewed synthetic target"] };
    partial.reviewer_role = reviewerRole;
    partial.reviewed_at = reviewedAt;
  }
  for (const relation of caseDecision.relation_decisions) {
    relation.decision = "approved";
    relation.reviewer_role = reviewerRole;
    relation.reviewed_at = reviewedAt;
  }
}
const completedResult = validate(completed);
assert.equal(completedResult.schema_valid, true, JSON.stringify(completedResult.schema_errors));
assert.equal(completedResult.packet_complete, true, JSON.stringify(completedResult.structural_errors));
assert.equal(completedResult.semantic_errors.length, 0, JSON.stringify(completedResult.semantic_errors));
assert.equal(completedResult.independent_review_complete, true);
assert.equal(completedResult.adjudicated_gold_ready, true);
console.log("PASS fully reviewed synthetic fixture completes");
console.log("ENGINE PHASE 4 GATE C ADJUDICATION TESTS: PASS");
