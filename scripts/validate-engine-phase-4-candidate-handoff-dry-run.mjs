import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const trackedReport = read("reports/engine-phase-4-candidate-handoff-dry-run.json");
const { HANDOFF_DRY_RUN_VERSION, HANDOFF_PROTECTED_SHA256, report: generatedReport } = await import("./run-engine-phase-4-candidate-handoff-dry-run.mjs");
const checks = [];
const check = (name, run) => checks.push({ name, run });

check("tracked report matches a fresh deterministic dry-run", () => assert.deepEqual(trackedReport, generatedReport));
check("report identity and fixed clock are exact", () => {
  assert.equal(trackedReport.report_version, HANDOFF_DRY_RUN_VERSION);
  assert.equal(trackedReport.generated_at, "2026-07-20T00:00:00+09:00");
  assert.equal(trackedReport.wall_clock_used, false);
  assert.equal(trackedReport.input.sha256, sha256(readText(trackedReport.input.path)));
  assert.equal(trackedReport.deterministic_rerun_match, true);
});
check("all protected files retain fixed hashes", () => {
  for (const [relativePath, expected] of Object.entries(HANDOFF_PROTECTED_SHA256)) {
    assert.equal(sha256(readText(relativePath)), expected, relativePath);
    assert.deepEqual(trackedReport.protected_files[relativePath], { sha256: expected, unchanged: true }, relativePath);
  }
});
check("24 cases reconcile and denominator is bounded", () => {
  assert.equal(trackedReport.metrics.input_case_count, 24);
  assert.equal(trackedReport.metrics.standalone_opportunity_scope_count, 16);
  assert.equal(trackedReport.reconciliation.valid, true);
  assert.equal(trackedReport.reconciliation.reconciled_count, 24);
  assert.equal(trackedReport.results.length, 24);
});
check("excluded deferred and blocked cases produce no candidate", () => {
  assert.equal(trackedReport.results.filter((item) => ["excluded_non_opportunity", "deferred_relation_resolution", "blocked"].includes(item.handoff_status)).every((item) => !item.candidate_output_created && !item.clean_apply_allowed && item.read_model === null), true);
});
check("needs-review candidates never relax to clean", () => {
  const review = trackedReport.results.filter((item) => item.handoff_status === "needs_review");
  assert.equal(review.length, trackedReport.metrics.needs_review_count);
  assert.equal(review.every((item) => item.candidate_output_created && !item.clean_apply_allowed && item.read_model?.review_status === "needs_review"), true);
  assert.equal(trackedReport.metrics.clean_count, 0);
});
check("positive and negative gate proofs pass", () => {
  assert.equal(trackedReport.positive_clean_path.included_in_actual_metrics, false);
  assert.equal(trackedReport.positive_clean_path.passed, true);
  assert.equal(trackedReport.positive_clean_path.result.handoff_status, "clean");
  assert.equal(Object.values(trackedReport.required_negative_paths).every(Boolean), true);
});
check("writes publication notification and external effects remain zero", () => {
  assert.equal(trackedReport.metrics.candidate_write_plan_count, 0);
  assert.equal(trackedReport.metrics.database_write_count, 0);
  assert.equal(trackedReport.metrics.automatic_publish_count, 0);
  assert.equal(trackedReport.metrics.notification_count, 0);
  assert.equal(Object.values(trackedReport.safety).every((value) => value === false || value === 0), true);
});
check("final decisions are internally consistent", () => {
  assert.equal(trackedReport.status, "LIMITED ENTRY PASS");
  assert.equal(trackedReport.decisions.deterministic_p0_safety, "PASS");
  assert.equal(trackedReport.decisions.deterministic_p0_completeness, "CONDITIONAL PASS");
  assert.equal(trackedReport.decisions.full_gate_c_safety, "PASS");
  assert.equal(trackedReport.decisions.full_field_automation_completeness, "CONDITIONAL PASS");
  assert.equal(trackedReport.decisions.candidate_handoff_safety, "PASS");
  assert.equal(trackedReport.decisions.limited_phase5_entry, "PASS");
  assert.equal(trackedReport.gate_status.phase4_closeout, "PASS");
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
console.log(`${passed}/${checks.length} candidate handoff dry-run validation checks passed`);
