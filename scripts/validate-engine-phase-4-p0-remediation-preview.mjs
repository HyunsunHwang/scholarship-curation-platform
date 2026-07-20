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
check("known case acceptance checks all pass", () => assert.equal(Object.values(trackedReport.known_case_checks).every(Boolean), true));
check("automatic publication is disabled for every output", () => {
  assert.equal(trackedReport.outputs.every((output) => output.review.automatic_publish_allowed === false), true);
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
