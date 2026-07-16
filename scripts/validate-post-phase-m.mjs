import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseJsonWithDuplicateKeyCheck } from "../lib/post-phase-l/strict-json.mjs";

const ROOT = process.cwd();
const TARGET_REF = "hrayfvdggbhfmmzfblly";
const REQUIRED = [
  "reports/post-phase-m-preexisting-worktree.json",
  "reports/post-phase-m-cohort-seed-plan.json",
  "reports/post-phase-m-cohort-seed-result.json",
  "reports/post-phase-m-controlled-cohort.json",
  "reports/post-phase-m-source-health.json",
  "reports/post-phase-m-review-operations.json",
  "reports/post-phase-m-incident-recovery.json",
  "reports/post-phase-m-platform-maintenance.json",
  "reports/post-phase-m-risk-register-update.json",
  "reports/post-phase-m-production-readiness.json",
  "reports/post-phase-m-browser-walkthrough.json",
  "reports/post-phase-m-runtime-verification.json",
  "reports/post-phase-m-local-test-report.json",
  "docs/post-phase-m-controlled-pilot.md",
  "docs/post-phase-m-operator-runbook.md",
  "docs/post-phase-m-platform-maintenance.md",
  "docs/post-phase-m-production-readiness-decision.md",
  "scripts/seed-post-phase-m-controlled-cohort.mjs",
  "scripts/run-post-phase-m-controlled-pilot.mjs",
  "scripts/verify-post-phase-m-runtime.mjs",
  "scripts/test-post-phase-m.mjs",
  "scripts/validate-post-phase-m.mjs",
];
const jsonFiles = [];
const checks = [];
const check = (name, passed, evidence) => checks.push({ name, passed: Boolean(passed), evidence });
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const json = (file) => {
  jsonFiles.push(file);
  return parseJsonWithDuplicateKeyCheck(read(file), file).value;
};

for (const file of REQUIRED) check(`required:${file}`, fs.existsSync(path.join(ROOT, file)), file);
if (checks.some((item) => !item.passed)) {
  console.error("POST-PHASE M: HOLD");
  process.exit(1);
}

const preexisting = json("reports/post-phase-m-preexisting-worktree.json");
const cohort = json("reports/post-phase-m-controlled-cohort.json");
const health = json("reports/post-phase-m-source-health.json");
const review = json("reports/post-phase-m-review-operations.json");
const recovery = json("reports/post-phase-m-incident-recovery.json");
const platform = json("reports/post-phase-m-platform-maintenance.json");
const production = json("reports/post-phase-m-production-readiness.json");
const browser = json("reports/post-phase-m-browser-walkthrough.json");
const runtime = json("reports/post-phase-m-runtime-verification.json");
const tests = json("reports/post-phase-m-local-test-report.json");
const cycle1 = json("reports/post-phase-m-live/cycle-1/cycle-report.json");
const cycle2 = json("reports/post-phase-m-live/cycle-2/cycle-report.json");
const riskUpdate = json("reports/post-phase-m-risk-register-update.json");
const masterRisk = json("reports/post-phase-master-risk-register.json");

const allCycles = [cycle1, cycle2];
const explicitHealth = new Set(["healthy", "degraded", "blocked", "unresolved", "zero_match_observed", "recovered", "regressed"]);
const effectiveDecisionMatch = review.decisions.filter((item) => item.decision === "approve").every((item) => item.effective_decision_match);

check("target project ref", runtime.target_project_ref === TARGET_REF, runtime.target_project_ref);
check("production access zero", !runtime.production_ref_detected && !runtime.production_read_performed && !runtime.production_write_performed, "false/false/false");
check("exact source resolution", cohort.exact_source_resolution_passed && cohort.fuzzy_source_match_count === 0 && cohort.automatic_source_create_count === 0, cohort.expansion_source_keys);
check("two complete cycles", runtime.cycle_count >= 2 && allCycles.every((cycle) => cycle.cycle_source_results_complete && cycle.source_results.length === 6), runtime.cycle_ids);
check("live positive control preserved", cohort.control_behavior_preserved === true, "cau_001");
check("source health complete", health.sources.length === 6 && health.sources.every((item) => explicitHealth.has(item.health)), health.sources.map((item) => `${item.source_key}:${item.health}`));
check("duplicate counts zero", runtime.duplicate_notice_count === 0 && runtime.duplicate_occurrence_count === 0 && runtime.duplicate_alias_count === 0, "0/0/0");
check("append-only review lifecycle", review.append_only_review_event_count >= 2 && effectiveDecisionMatch, review.append_only_review_event_count);
check("review event immutability", recovery.review_event_immutability_runtime_passed === true, "update/delete rejected");
check("controlled preview fail-closed", review.controlled_projection_preview_count >= 1 && runtime.public_leakage_count === 0 && runtime.automatic_public_publish_count === 0, "preview with zero leakage");
check("rollback/reapply/replay", recovery.rollback_rehearsed && recovery.reapply_passed && recovery.post_reapply_replay_match && recovery.unrelated_table_change_count === 0, recovery.rollback_run_id);
check("authenticated browser walkthrough", browser.authenticated_admin_layout_reached && browser.browser_walkthrough_complete && browser.browser_console_error_count === 0 && browser.browser_runtime_error_count === 0, browser.routes_verified);
check("public browser fail-closed", !browser.public_list_leakage_detected && !browser.numeric_preview_route_leakage_detected && !browser.desktop_overflow && !browser.mobile_390_overflow, "no leakage or overflow");
check("external LLM disabled", runtime.external_llm_call_count === 0 && browser.external_llm_persistence_added === false, "0 calls / no persistence");
check("platform maintenance", platform.status === "PASS_WITH_EXPLICIT_BASELINE" && platform.m_introduced_finding_count === 0 && platform.scoped_eslint_passed === true && platform.typescript_passed === true && platform.build_passed === true, platform.final_full_eslint);
check("production decision is truthful HOLD", production.production_rollout_decision === "HOLD" && production.production_rollout_authorized === false && production.production_migration_executed === false, production.exact_blockers);
check("M tests", tests.passed === true, `${tests.passed_count}/${tests.test_count}`);
check("risk register strict and complete", riskUpdate.passed && riskUpdate.duplicate_risk_id_count === 0 && riskUpdate.unresolved_without_owner_count === 0 && riskUpdate.unresolved_without_next_phase_count === 0 && masterRisk.risks.every((risk) => risk.status === "resolved" || (risk.owner && risk.next_resolution_phase && risk.next_work_unit && risk.success_criteria && risk.blocking_for_next_phase !== undefined)), masterRisk.risks.length);

const safeRoot = ROOT.replace(/\\/g, "/");
const changed = execFileSync("git", ["-c", `safe.directory=${safeRoot}`, "diff", "--name-only", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
const untracked = execFileSync("git", ["-c", `safe.directory=${safeRoot}`, "ls-files", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
const ownedFiles = [...new Set([...changed, ...untracked])].sort();
const preexistingFiles = new Set(preexisting.preexisting_changed_files ?? []);
const preexistingOverlap = ownedFiles.filter((file) => preexistingFiles.has(file));

const scannedFiles = ownedFiles.filter((file) => fs.existsSync(path.join(ROOT, file)) && fs.statSync(path.join(ROOT, file)).isFile());
const secretPatterns = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /postgres(?:ql)?:\/\/\S+/gi,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];
let secretLeakCount = 0;
let absoluteLocalPathCount = 0;
let forbiddenProductionRefCount = 0;
for (const file of scannedFiles) {
  const content = read(file);
  secretLeakCount += secretPatterns.reduce((count, pattern) => count + (content.match(pattern)?.length ?? 0), 0);
  absoluteLocalPathCount += (content.match(/[A-Z]:\\Users\\|\/c\/Users\//gi)?.length ?? 0);
  const forbiddenRefPattern = new RegExp(["synwudnxd", "kybwihwmtak"].join(""), "g");
  forbiddenProductionRefCount += (content.match(forbiddenRefPattern)?.length ?? 0);
}
check("secret scan", secretLeakCount === 0, secretLeakCount);
check("absolute local path scan", absoluteLocalPathCount === 0, absoluteLocalPathCount);
check("production ref scan", forbiddenProductionRefCount === 0, forbiddenProductionRefCount);
check("preexisting overlap", preexistingOverlap.length === 0, preexistingOverlap);

const duplicateJsonKeyCount = jsonFiles.reduce((count, file) => {
  try { parseJsonWithDuplicateKeyCheck(read(file), file); return count; }
  catch { return count + 1; }
}, 0);
check("duplicate JSON keys", duplicateJsonKeyCount === 0, duplicateJsonKeyCount);

const passed = checks.every((item) => item.passed);
const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-m-validation/v1",
  post_phase_m_status: passed ? "PASS" : "HOLD",
  controlled_pilot_status: runtime.passed ? "PASS" : "HOLD",
  cohort_expansion_decision: cohort.expansion_decision,
  production_rollout_decision: production.production_rollout_decision,
  target_project_ref: runtime.target_project_ref,
  production_ref_detected: runtime.production_ref_detected,
  production_read_performed: runtime.production_read_performed,
  production_write_performed: runtime.production_write_performed,
  exact_source_resolution_passed: cohort.exact_source_resolution_passed,
  fuzzy_source_match_count: cohort.fuzzy_source_match_count,
  automatic_source_create_count: cohort.automatic_source_create_count,
  cycle_count: runtime.cycle_count,
  cycle_source_results_complete: allCycles.every((cycle) => cycle.cycle_source_results_complete),
  live_positive_control_preserved: cohort.control_behavior_preserved,
  source_health_classification_complete: health.sources.length === 6 && health.sources.every((item) => explicitHealth.has(item.health)),
  duplicate_notice_count: runtime.duplicate_notice_count,
  duplicate_occurrence_count: runtime.duplicate_occurrence_count,
  duplicate_alias_count: runtime.duplicate_alias_count,
  append_only_review_event_count: review.append_only_review_event_count,
  effective_decision_match: effectiveDecisionMatch,
  review_event_immutability_runtime_passed: recovery.review_event_immutability_runtime_passed,
  controlled_projection_preview_enabled: review.controlled_projection_preview_count >= 1,
  public_leakage_count: runtime.public_leakage_count,
  automatic_public_publish_count: runtime.automatic_public_publish_count,
  rollback_rehearsed: recovery.rollback_rehearsed,
  reapply_passed: recovery.reapply_passed,
  post_reapply_replay_match: recovery.post_reapply_replay_match,
  unrelated_table_change_count: recovery.unrelated_table_change_count,
  authenticated_admin_layout_reached: browser.authenticated_admin_layout_reached,
  browser_walkthrough_complete: browser.browser_walkthrough_complete,
  browser_console_error_count: browser.browser_console_error_count,
  browser_runtime_error_count: browser.browser_runtime_error_count,
  external_llm_call_count: runtime.external_llm_call_count,
  external_llm_persistence_added: browser.external_llm_persistence_added,
  secret_leak_count: secretLeakCount,
  duplicate_json_key_count: duplicateJsonKeyCount,
  absolute_local_path_count: absoluteLocalPathCount,
  production_ref_scan_count: forbiddenProductionRefCount,
  preexisting_file_inclusion_count: preexistingOverlap.length,
  production_rollout_authorized: production.production_rollout_authorized,
  production_migration_executed: production.production_migration_executed,
  owned_file_count: ownedFiles.length,
  checks,
  passed,
};
fs.writeFileSync(path.join(ROOT, "reports/post-phase-m-validation-report.json"), `${JSON.stringify(report, null, 2)}\n`);
const markdown = `# Post-Phase M Validation\n\n**Status: ${report.post_phase_m_status}**\n\n- Controlled pilot: ${report.controlled_pilot_status}\n- Cohort expansion: ${report.cohort_expansion_decision}\n- Production rollout: ${report.production_rollout_decision}\n- Checks passed: ${checks.filter((item) => item.passed).length}/${checks.length}\n- Secret leaks: ${secretLeakCount}\n- Duplicate JSON keys: ${duplicateJsonKeyCount}\n- Absolute local paths: ${absoluteLocalPathCount}\n- Preexisting overlap: ${preexistingOverlap.length}\n`;
fs.writeFileSync(path.join(ROOT, "reports/post-phase-m-validation-report.md"), markdown);
console.log(`POST-PHASE M: ${report.post_phase_m_status}`);
if (!passed) process.exitCode = 1;
