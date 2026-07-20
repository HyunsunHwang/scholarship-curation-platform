import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../lib/engine-phase-4/p0-remediation-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const trackedReport = read("reports/engine-phase-4-gate-c-p0-remediated.json");
const {
  OFFICIAL_P0_REMEDIATED_EXTRACTOR_SHA256,
  OFFICIAL_P0_REMEDIATED_PROTECTED_SHA256,
  OFFICIAL_P0_REMEDIATED_REPORT_VERSION,
  report: generatedReport,
} = await import("./evaluate-engine-phase-4-gate-c-p0-remediated.mjs");
const checks = [];
const check = (name, run) => checks.push({ name, run });

check("tracked report exactly matches a fresh official evaluation", () => assert.deepEqual(trackedReport, generatedReport));
check("official boundary metadata remains explicit", () => {
  assert.equal(trackedReport.report_version, OFFICIAL_P0_REMEDIATED_REPORT_VERSION);
  assert.equal(trackedReport.official_p0_reevaluation_completed, true);
  assert.equal(trackedReport.official_full_gate_c_reevaluation_completed, false);
  assert.equal(trackedReport.candidate_handoff_test_completed, false);
  assert.equal(trackedReport.full_gate_c_status, "HOLD");
  assert.equal(trackedReport.phase5_status, "HOLD");
});
check("extractor identity is fixed to remediated 1.1.1", () => {
  assert.equal(trackedReport.identity.remediated_extractor.version, "1.1.1");
  assert.equal(trackedReport.identity.remediated_extractor.sha256, OFFICIAL_P0_REMEDIATED_EXTRACTOR_SHA256);
  assert.equal(sha256(readText(trackedReport.identity.remediated_extractor.path)), OFFICIAL_P0_REMEDIATED_EXTRACTOR_SHA256);
});
check("all protected historical and input hashes remain unchanged", () => {
  for (const [relativePath, expected] of Object.entries(OFFICIAL_P0_REMEDIATED_PROTECTED_SHA256)) {
    assert.equal(sha256(readText(relativePath)), expected, relativePath);
    assert.deepEqual(trackedReport.protected_baselines[relativePath], { sha256: expected, unchanged: true }, relativePath);
  }
});
check("input identity hashes agree with protected hashes", () => {
  for (const item of [
    trackedReport.identity.p0_contract_schema,
    trackedReport.identity.frozen_corpus,
    trackedReport.identity.adjudication_decisions,
    trackedReport.identity.adjudication_overlay,
    trackedReport.identity.production_source_review,
    trackedReport.identity.baseline_official_p0_report,
  ]) assert.equal(item.sha256, OFFICIAL_P0_REMEDIATED_PROTECTED_SHA256[item.path], item.path);
});
check("required execution and reviewer-resolved safety conditions pass", () => {
  assert.equal(trackedReport.execution.case_count, 24);
  assert.equal(trackedReport.execution.schema_valid_count, 24);
  assert.equal(trackedReport.execution.semantic_valid_count, 24);
  assert.equal(trackedReport.execution.deterministic_rerun_match, true);
  assert.equal(trackedReport.execution.unsupported_present_claim_count, 0);
  assert.equal(trackedReport.execution.missing_evidence_reference_count, 0);
  assert.equal(trackedReport.execution.source_url_substitution_count, 0);
  assert.equal(trackedReport.execution.automatic_publish_allowed_count, 0);
  assert.equal(trackedReport.execution.invalid_lifecycle_semantic_count, 0);
  assert.equal(trackedReport.frozen_reviewer_resolved.safety_gates.recruitment_suppressed_count, 0);
  assert.equal(trackedReport.frozen_reviewer_resolved.safety_gates.non_recruitment_exposed_as_opportunity_count, 0);
  assert.equal(trackedReport.frozen_reviewer_resolved.safety_gates.critical_publishability_error_count, 0);
});
check("frozen denominator and shadow boundary cannot be conflated", () => {
  assert.equal(trackedReport.denominator_policy.total_concept_slot_count, 216);
  assert.equal(trackedReport.denominator_policy.resolved_p0_field_count, 14);
  assert.equal(trackedReport.denominator_policy.pending_p0_field_count, 198);
  assert.equal(trackedReport.denominator_policy.unresolved_p0_field_count, 4);
  assert.equal(trackedReport.production_source_shadow.concept_slot_count, 171);
  assert.equal(trackedReport.production_source_shadow.included_in_frozen_correctness_denominator, false);
});
check("decision is consistent with safety and deterministic limitations", () => {
  assert.equal(trackedReport.mandatory_safety_passed, Object.values(trackedReport.mandatory_safety).every(Boolean));
  if (!trackedReport.mandatory_safety_passed) assert.equal(trackedReport.decision, "HOLD");
  if (trackedReport.decision === "PASS") assert.equal(trackedReport.conditional_limitations.length, 0);
  if (trackedReport.decision === "CONDITIONAL PASS") assert.equal(trackedReport.mandatory_safety_passed, true);
  assert.equal(trackedReport.gate_status.official_p0_reevaluation, trackedReport.decision);
  assert.equal(trackedReport.gate_status.full_schema_gate_c, "HOLD");
  assert.equal(trackedReport.gate_status.phase5, "HOLD");
});
check("all declared safety flags remain false", () => assert.equal(Object.values(trackedReport.safety).every((value) => value === false), true));
check("OCR boundary forbids unlocated present claims", () => {
  assert.equal(trackedReport.ocr_boundary.bbox_missing_ocr_present_claim_count, 0);
  assert.equal(trackedReport.ocr_boundary.ocr_present_claim_count, 0);
  assert.equal(trackedReport.ocr_boundary.ocr_status_accepted_count, trackedReport.ocr_boundary.parser_success_status_accepted_count);
  assert.ok(trackedReport.ocr_boundary.parser_success_status_accepted_count > 0);
});
check("report contains no local paths or credential-shaped values", () => {
  const serialized = JSON.stringify(trackedReport);
  assert.equal(serialized.includes("/Users/"), false);
  assert.equal(/(?:SUPABASE|OPENAI|API_KEY|SECRET|PASSWORD)/u.test(serialized), false);
});

let passed = 0;
for (const item of checks) {
  item.run();
  passed += 1;
  console.log(`PASS ${item.name}`);
}
console.log(`${passed}/${checks.length} official P0 remediated report validation checks passed`);
