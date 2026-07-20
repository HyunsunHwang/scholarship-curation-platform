import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { sha256, validateP0RemediationRecord } from "../lib/engine-phase-4/p0-remediation-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const schema = read("schemas/engine/phase-4-p0-remediation-output.schema.json");
const trackedReport = read("reports/engine-phase-4-p0-remediation-preview.json");
const {
  P0_REMEDIATION_PREVIEW_AS_OF,
  P0_REMEDIATION_PROTECTED_SHA256,
  report: generatedReport,
} = await import("./run-engine-phase-4-p0-remediation-preview.mjs");
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const schemaValidator = ajv.compile(schema);
const checks = [];
const check = (name, run) => checks.push({ name, run });

check("tracked report matches freshly generated report", () => assert.deepEqual(trackedReport, generatedReport));
check("preview boundary flags remain explicit", () => {
  assert.equal(trackedReport.preview_only, true);
  assert.equal(trackedReport.official_p0_reevaluation_completed, false);
  assert.equal(trackedReport.official_full_gate_c_reevaluation_completed, false);
  assert.equal(trackedReport.full_gate_c_status, "HOLD");
  assert.equal(trackedReport.phase5_status, "HOLD");
  assert.equal(trackedReport.evaluation_as_of, P0_REMEDIATION_PREVIEW_AS_OF);
});
check("all 24 outputs pass schema and semantic validation", () => {
  assert.equal(trackedReport.outputs.length, 24);
  for (const output of trackedReport.outputs) {
    assert.equal(schemaValidator(output), true, JSON.stringify(schemaValidator.errors));
    const semantic = validateP0RemediationRecord(output, schemaValidator);
    assert.equal(semantic.valid, true, `${output.case_id}: ${JSON.stringify(semantic.errors)}`);
  }
});
check("preview metrics enforce evidence and URL safety", () => {
  assert.equal(trackedReport.metrics.schema_valid_count, 24);
  assert.equal(trackedReport.metrics.semantic_valid_count, 24);
  assert.equal(trackedReport.metrics.deterministic_rerun_match, true);
  assert.equal(trackedReport.metrics.unsupported_present_claim_count, 0);
  assert.equal(trackedReport.metrics.missing_evidence_reference_count, 0);
  assert.equal(trackedReport.metrics.source_url_substitution_count, 0);
});
check("evidence diagnostics cover every case and reconcile with metrics", () => {
  const diagnostics = trackedReport.diagnostics.case_evidence_diagnostics;
  assert.equal(diagnostics.length, 24);
  for (const metric of [
    "low_quality_body_rejected_count",
    "attachment_missing_provenance_count",
    "attachment_rejected_count",
    "ocr_missing_locator_count",
    "ocr_low_quality_rejected_count",
    "classification_title_only_count",
    "classification_multi_evidence_count",
    "duplicate_evidence_suppressed_count",
    "attachment_present_claim_count",
    "ocr_present_claim_count",
  ]) {
    assert.equal(Number.isInteger(trackedReport.metrics[metric]), true, metric);
    assert.ok(trackedReport.metrics[metric] >= 0, metric);
    assert.equal(trackedReport.metrics[metric], diagnostics.reduce((sum, item) => sum + item[metric], 0), metric);
  }
});
check("classification and present-field diagnostics resolve to actual evidence", () => {
  const outputs = new Map(trackedReport.outputs.map((output) => [output.case_id, output]));
  for (const diagnostic of trackedReport.diagnostics.case_evidence_diagnostics) {
    const output = outputs.get(diagnostic.case_id);
    const evidence = new Map(output.evidence_references.map((item) => [item.evidence_id, item]));
    assert.deepEqual(diagnostic.classification_evidence_ids, output.classification.evidence_references, diagnostic.case_id);
    assert.equal(diagnostic.classification_evidence_ids.every((reference) => evidence.has(reference)), true, diagnostic.case_id);
    for (const [fieldName, sourceTypes] of Object.entries(diagnostic.present_field_evidence_sources)) {
      assert.equal(output.fields[fieldName].status, "present", `${diagnostic.case_id}:${fieldName}`);
      const actual = [...new Set(output.fields[fieldName].evidence_references.map((reference) => evidence.get(reference)?.source_type).filter(Boolean))];
      assert.deepEqual(sourceTypes, actual, `${diagnostic.case_id}:${fieldName}`);
    }
  }
});
check("attachment and OCR evidence always retain complete provenance", () => {
  for (const output of trackedReport.outputs) {
    for (const evidence of output.evidence_references) {
      if (!["html_text"].includes(evidence.source_type)) {
        assert.ok(evidence.document_id, `${output.case_id}:${evidence.evidence_id}:document_id`);
        assert.ok(evidence.document_revision_id, `${output.case_id}:${evidence.evidence_id}:document_revision_id`);
        assert.match(evidence.document_hash, /^[a-f0-9]{64}$/u, `${output.case_id}:${evidence.evidence_id}:document_hash`);
      }
      if (evidence.source_type === "ocr_text") {
        assert.match(evidence.locator, /:page:(?!unknown)[^:]+:bbox:(?!none)/u, `${output.case_id}:${evidence.evidence_id}:locator`);
      }
    }
  }
});
check("known case acceptance checks all pass", () => assert.equal(Object.values(trackedReport.known_case_checks).every(Boolean), true));
check("Case 20 support type is present and only its amount is a schema gap", () => {
  const output = trackedReport.outputs.find((item) => item.case_id === "p4c_020_uic_supporters_table");
  assert.equal(output.fields.support_type.status, "present");
  assert.deepEqual(output.fields.support_type.value, ["activity_scholarship", "work_scholarship"]);
  assert.equal(output.fields.support_amount.status, "schema_expressiveness_gap");
  assert.equal(output.review.reasons.includes("support_type_uncertain"), false);
});
check("automatic publication is disabled for every output", () => {
  assert.equal(trackedReport.outputs.every((output) => output.review.automatic_publish_allowed === false), true);
});
check("main merge and other prohibited side effects remain disabled", () => {
  assert.equal(trackedReport.safety.main_merged, false);
  assert.equal(Object.values(trackedReport.safety).every((value) => value === false), true);
});
check("extractor and corpus hashes match current files", () => {
  assert.equal(trackedReport.extractor.remediated.sha256, sha256(readText(trackedReport.extractor.remediated.path)));
  assert.equal(trackedReport.corpus.sha256, sha256(readText(trackedReport.corpus.path)));
});
check("protected baseline hashes are unchanged", () => {
  for (const [relativePath, expected] of Object.entries(P0_REMEDIATION_PROTECTED_SHA256)) {
    assert.equal(sha256(readText(relativePath)), expected, relativePath);
    assert.equal(trackedReport.protected_baselines[relativePath].unchanged, true, relativePath);
  }
});
check("report does not contain local paths or credential-shaped values", () => {
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
console.log(`${passed}/${checks.length} P0 remediation preview validation checks passed`);
