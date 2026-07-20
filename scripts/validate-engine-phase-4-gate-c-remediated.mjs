import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const trackedReport = read("reports/engine-phase-4-gate-c-remediated.json");
const { FULL_GATE_C_REMEDIATED_PROTECTED_SHA256, FULL_GATE_C_REMEDIATED_REPORT_VERSION, report: generatedReport } = await import("./evaluate-engine-phase-4-gate-c-remediated.mjs");
const checks = [];
const check = (name, run) => checks.push({ name, run });

check("tracked report exactly matches a fresh deterministic evaluation", () => assert.deepEqual(trackedReport, generatedReport));
check("hybrid identity and semantic boundary are explicit", () => {
  assert.equal(trackedReport.report_version, FULL_GATE_C_REMEDIATED_REPORT_VERSION);
  assert.equal(trackedReport.evaluation_record_kind, "p0_remediated_hybrid");
  assert.equal(trackedReport.non_p0_fields_source, "historical_baseline_extractor");
  assert.equal(trackedReport.p0_fields_source, "p0_remediated_extractor_1.1.1");
  assert.equal(trackedReport.production_engine_claimed, false);
  assert.equal(trackedReport.full_field_remediated_extractor_claimed, false);
  assert.equal(trackedReport.contract_aligned_comparable_lens.legacy_status_semantic_incompatible, true);
  assert.equal(trackedReport.contract_aligned_comparable_lens.legacy_status_field_excluded_from_contract_aligned_accuracy, true);
});
check("all protected historical and frozen files retain fixed hashes", () => {
  for (const [relativePath, expected] of Object.entries(FULL_GATE_C_REMEDIATED_PROTECTED_SHA256)) {
    assert.equal(sha256(readText(relativePath)), expected, relativePath);
    assert.deepEqual(trackedReport.protected_files[relativePath], { sha256: expected, unchanged: true }, relativePath);
  }
});
check("corrected official P0 report identity is exact", () => {
  assert.equal(trackedReport.identity.official_p0_reevaluation_sha256, sha256(readText(trackedReport.identity.official_p0_reevaluation_path)));
  assert.equal(trackedReport.identity.official_p0_decision, "CONDITIONAL PASS");
});
check("canonical schema evidence and deterministic safety are complete", () => {
  assert.equal(trackedReport.execution_safety.case_count, 24);
  assert.equal(trackedReport.execution_safety.canonical_schema_valid_count, 24);
  assert.equal(trackedReport.execution_safety.evidence_integrity_count, 24);
  assert.equal(trackedReport.execution_safety.missing_evidence_reference_count, 0);
  assert.equal(trackedReport.execution_safety.unsupported_present_value_count, 0);
  assert.equal(trackedReport.execution_safety.automatic_publish_count, 0);
  assert.equal(trackedReport.execution_safety.deterministic_rerun, true);
});
check("identity candidates cannot remain stale or usable", () => {
  assert.equal(trackedReport.execution_safety.stale_program_candidate_count, 0);
  assert.equal(trackedReport.execution_safety.stale_cycle_candidate_count, 0);
  assert.equal(trackedReport.usability.program_candidate_usable_count, 0);
  assert.equal(trackedReport.usability.cycle_candidate_usable_count, 0);
  assert.equal(trackedReport.usability.phase5_handoff_usable_count, 0);
  assert.equal(trackedReport.records.every((record) => record.program_identity_candidate.resolution_status !== "proposed"), true);
  assert.equal(trackedReport.records.every((record) => record.recruitment_cycle_identity_candidate.resolution_status !== "proposed"), true);
});
check("P0 critical safety remains zero and shadow risks remain distinct", () => {
  assert.equal(Object.values(trackedReport.contract_aligned_comparable_lens.p0_safety_metrics).every((value) => value === 0), true);
  assert.equal(trackedReport.production_shadow_risks.overclaim_count, 0);
  assert.equal(trackedReport.production_shadow_risks.representation_loss_risk_count, 3);
  assert.equal(trackedReport.production_shadow_risks.schema_gap_collapsed_to_present_count, 3);
});
check("OCR metrics use corrected actual counts", () => {
  assert.equal(trackedReport.ocr_boundary.parser_success_status_accepted_count, 7);
  assert.equal(trackedReport.ocr_boundary.ocr_status_accepted_count, 0);
  assert.equal(trackedReport.ocr_boundary.ocr_missing_locator_count, 0);
  assert.equal(trackedReport.ocr_boundary.ocr_present_claim_count, 0);
  assert.equal(trackedReport.ocr_boundary.bbox_missing_ocr_present_claim_count, 0);
});
check("decision matches mandatory gates and keeps future execution closed", () => {
  assert.equal(trackedReport.mandatory_safety_passed, Object.values(trackedReport.mandatory_safety).every(Boolean));
  assert.equal(trackedReport.decision, "CONDITIONAL PASS");
  assert.equal(trackedReport.gate_status.full_gate_c_remediated_reevaluation, trackedReport.decision);
  assert.equal(trackedReport.gate_status.candidate_handoff, "NOT RUN");
  assert.equal(trackedReport.gate_status.phase5, "HOLD");
  assert.equal(Object.values(trackedReport.safety).every((value) => value === false), true);
});
check("report contains no local path or credential-shaped value", () => {
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
console.log(`${passed}/${checks.length} remediated full Gate C validation checks passed`);
