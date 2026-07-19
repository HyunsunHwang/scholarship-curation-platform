import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { P0_AS_OF, evaluateP0Audit, validateP0Overlay } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const decisions = read("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json");
const overlay = read("fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json");
const context = { extractorVersion: "1.0.0", parserContractVersion: "engine-phase-3-document-result/v1", evaluationFixtureVersion: corpus.fixture_version, extractedAt: P0_AS_OF };
const buildRecords = () => new Map(corpus.cases.map((fixture) => [fixture.case_id, extractDeterministicScholarshipCandidate({ ...fixture.evaluation_input, extractionContext: context })]));

const overlayValidation = validateP0Overlay(corpus, decisions, overlay);
assert.equal(overlayValidation.valid, true, overlayValidation.errors.join("; "));
assert.equal(overlay.cases.length, 24);
assert.equal(overlay.cases.flatMap((item) => item.fields).filter((item) => item.decision === "resolved").length, 6);
assert.equal(overlay.cases.flatMap((item) => item.fields).filter((item) => item.decision === "unresolved").length, 3);
console.log("PASS Batch 1 P0 overlay is complete and bounded");

const records = buildRecords();
const first = evaluateP0Audit({ corpus, adjudicationDecisions: decisions, overlay, recordsByCase: records });
const second = evaluateP0Audit({ corpus, adjudicationDecisions: decisions, overlay, recordsByCase: buildRecords() });
assert.equal(JSON.stringify(first), JSON.stringify(second));
assert.equal(first.as_of, P0_AS_OF);
assert.equal(first.responsibility_boundary.deterministic_fields.some((item) => item.includes("lifecycle derivation from unambiguous")), true);
assert.equal(first.responsibility_boundary.human_review_required.some((item) => item.includes("date roles or timezone are ambiguous")), true);
assert.equal(first.responsibility_boundary.human_review_required.includes("lifecycle status"), false);
console.log("PASS repeated audit is byte-equivalent with fixed as_of");

assert.equal(first.corpus.resolved_p0_field_count, 15);
assert.equal(first.corpus.pending_p0_field_count, 221);
assert.equal(first.corpus.unresolved_p0_field_count, 4);
assert.equal(first.aggregate_metrics.field_presence_precision.status, "evaluated");
assert.equal(first.category_metrics.identity_exact.status, "evaluated");
assert.equal(first.case_metrics.pending_p0_case_count, 24);
assert.equal(first.case_metrics.partially_adjudicated_p0_case_count, 5);
assert.equal(first.case_metrics.fully_pending_p0_case_count, 19);
console.log("PASS pending and unresolved gold are excluded from resolved-only denominators");

const oneApproved = JSON.parse(JSON.stringify(decisions));
const program = oneApproved.cases[1].fields.find((item) => item.field_name === "scholarship_program_name");
program.decision = "approved";
program.reviewer_role = "independent_human_reviewer";
program.reviewed_at = "2026-07-20T01:00:00Z";
const oneResolved = evaluateP0Audit({ corpus, adjudicationDecisions: oneApproved, overlay, recordsByCase: records });
assert.equal(oneResolved.corpus.resolved_p0_field_count, 16);
assert.equal(oneResolved.category_metrics.identity_exact.status, "evaluated");
assert.equal(oneResolved.category_metrics.identity_exact.denominator, first.category_metrics.identity_exact.denominator + 1);
console.log("PASS only reviewer-approved fields enter resolved denominators");

const automatedApproval = JSON.parse(JSON.stringify(decisions));
const automatedProgram = automatedApproval.cases[1].fields.find((item) => item.field_name === "scholarship_program_name");
automatedProgram.decision = "approved";
automatedProgram.reviewer_role = "llm_judge";
automatedProgram.reviewed_at = "2026-07-20T01:00:00Z";
const automatedResult = evaluateP0Audit({ corpus, adjudicationDecisions: automatedApproval, overlay, recordsByCase: records });
assert.equal(automatedResult.corpus.resolved_p0_field_count, 15);
console.log("PASS non-human full-field approvals fail closed as pending");

const oneSafetyApproved = JSON.parse(JSON.stringify(decisions));
const documentKind = oneSafetyApproved.cases[5].fields.find((item) => item.field_name === "document_kind");
documentKind.decision = "approved";
documentKind.reviewer_role = "independent_human_reviewer";
documentKind.reviewed_at = "2026-07-20T01:00:00Z";
const oneSafetyResolved = evaluateP0Audit({ corpus, adjudicationDecisions: oneSafetyApproved, overlay, recordsByCase: records });
assert.equal(oneSafetyResolved.safety_gates.pending_publishability_case_count, 18);
assert.equal(oneSafetyResolved.safety_gates.non_recruitment_exposed_as_opportunity_count, 1);
assert.equal(oneSafetyResolved.safety_gates.critical_publishability_error_count, first.safety_gates.critical_publishability_error_count + 1);
assert.equal(oneSafetyResolved.critical_errors.some((item) => item.case_id === corpus.cases[5].case_id && item.error === "non_recruitment_exposed_as_opportunity" && item.verified_against_gold), true);
console.log("PASS reviewer-resolved publishability errors enter safety counters");

const firstFixture = corpus.cases[0];
const firstRecord = records.get(firstFixture.case_id);
assert.equal(firstFixture.evaluation_input.sourceNotice.canonical_url, firstFixture.public_url);
assert.notEqual(firstRecord.fields.application_url.value_status, "present");
assert.notEqual(firstRecord.fields.application_url.normalized_value, firstFixture.public_url);
console.log("PASS canonical notice URL is not counted as extracted application URL");

assert.equal(first.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status").length, 5);
assert.equal(first.safety_gates.pending_publishability_case_count, 19);
assert.equal(first.safety_gates.recruitment_suppressed_count, 3);
assert.equal(first.safety_gates.critical_publishability_error_count, 3);
console.log("PASS lifecycle semantic defects and resolved publishability errors remain visible");

const case4Publishability = first.reviewer_resolved_field_results.find((item) => item.case_id === "p4c_004_national_work_result" && item.field_name === "publishable_opportunity");
assert.equal(case4Publishability.gold.normalized_value, false);
assert.equal(case4Publishability.prediction.normalized_value, false);
assert.equal(case4Publishability.exact, true);
const case5Results = Object.fromEntries(first.reviewer_resolved_field_results.filter((item) => item.case_id === "p4c_005_miraero_second").map((item) => [item.field_name, item]));
assert.equal(case5Results.provider.gold.normalized_value, "고려대학교");
assert.equal(case5Results.institution_or_campus.gold.normalized_value, "고려대학교 세종캠퍼스");
assert.equal(case5Results.application_start.exact, true);
assert.equal(case5Results.application_deadline.exact, true);
assert.equal(case5Results.timezone.exact, true);
assert.equal(case5Results.lifecycle_status.gold.normalized_value, "closed");
assert.equal(case5Results.lifecycle_status.exact, false);
console.log("PASS Case 4 publishability and Case 5 bounded decisions are evaluated explicitly");

const unsupportedRecords = new Map(records);
const unsupportedRecord = JSON.parse(JSON.stringify(records.get(firstFixture.case_id)));
unsupportedRecord.fields.provider = { ...unsupportedRecord.fields.provider, value_status: "present", normalized_value: "unsupported provider", evidence_refs: [] };
unsupportedRecords.set(firstFixture.case_id, unsupportedRecord);
const unsupported = evaluateP0Audit({ corpus, adjudicationDecisions: decisions, overlay, recordsByCase: unsupportedRecords });
assert.equal(unsupported.aggregate_metrics.unsupported_claim_count > first.aggregate_metrics.unsupported_claim_count, true);
assert.equal(unsupported.critical_errors.some((item) => item.error === "unsupported_present_claim"), true);
console.log("PASS unsupported claims remain visible");

const invalidOverlay = JSON.parse(JSON.stringify(overlay));
const overlayField = invalidOverlay.cases[5].fields[0];
overlayField.decision = "resolved";
overlayField.adjudicated_gold = { status: "present", normalized_value: ["고려대학교"], evidence_ids: [] };
overlayField.review_reason = "Synthetic test.";
overlayField.reviewer_role = "llm_judge";
overlayField.reviewed_at = "2026-07-20T01:00:00Z";
assert.equal(validateP0Overlay(corpus, decisions, invalidOverlay).valid, false);
console.log("PASS automated reviewer cannot resolve P0 overlay gold");
console.log("ENGINE PHASE 4 GATE C P0 TESTS: PASS");
