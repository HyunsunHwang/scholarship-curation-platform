import fs from "node:fs";
import path from "node:path";
import { buildPostPhaseMCohortPlan } from "../lib/post-phase-m/controlled-cohort.mjs";
import { parseJsonWithDuplicateKeyCheck } from "../lib/post-phase-l/strict-json.mjs";

const ROOT = process.cwd();
const json = (file) => parseJsonWithDuplicateKeyCheck(fs.readFileSync(path.join(ROOT, file), "utf8"), file).value;
const results = [];
const test = (name, passed, evidence) => results.push({ name, passed: Boolean(passed), evidence });

const plan = buildPostPhaseMCohortPlan();
const cycle1 = json("reports/post-phase-m-live/cycle-1/cycle-report.json");
const cycle2 = json("reports/post-phase-m-live/cycle-2/cycle-report.json");
const health = json("reports/post-phase-m-source-health.json");
const recovery = json("reports/post-phase-m-incident-recovery.json");

test("exact six-source cohort", plan.exact_source_resolution_passed && plan.source_count === 6, plan.source_keys);
test("no fuzzy source matching", plan.fuzzy_source_match_count === 0, plan.fuzzy_source_match_count);
test("cau_012 remains inventory-only", plan.inventory_only_risk.source_inventory_status === "absent" && plan.inventory_only_risk.source_absence_proven === false, plan.inventory_only_risk);
test("bounded cycle limits", [cycle1, cycle2].every((cycle) => cycle.crawl_bounds.max_items_per_source <= 30 && cycle.crawl_bounds.max_pages_per_source <= 5 && cycle.crawl_bounds.source_concurrency === 1), [cycle1.crawl_bounds, cycle2.crawl_bounds]);
test("positive control is repeatable", [cycle1, cycle2].every((cycle) => cycle.source_results.find((item) => item.source_key === "cau_001")?.classification === "success_attributable"), "cau_001");
test("expansion live attribution", ["cau_003", "cau_007"].every((source) => health.sources.find((item) => item.source_key === source)?.health === "healthy"), ["cau_003", "cau_007"]);
test("transport is not zero-match", health.sources.find((item) => item.source_key === "cau_002")?.final_classification === "blocked_transport", "cau_002");
test("zero-match does not infer absence", health.deletion_or_absence_inference_count === 0, health.deletion_or_absence_inference_count);
test("cycle duplicate invariants", [cycle1, cycle2].every((cycle) => cycle.duplicate_notice_count + cycle.duplicate_occurrence_count + cycle.duplicate_alias_count === 0), "all duplicate counts zero");
test("review events are immutable", recovery.review_event_update_rejected && recovery.review_event_delete_rejected, "update/delete rejected");
test("bounded rollback and reapply", recovery.rollback_rehearsed && recovery.reapply_passed && recovery.post_reapply_replay_match && recovery.unrelated_table_change_count === 0, recovery.rollback_run_id);
test("public exposure fails closed", recovery.public_leakage_count === 0 && recovery.automatic_public_publish_count === 0, "zero leakage and automatic publish");

const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-m-local-tests/v1",
  test_count: results.length,
  passed_count: results.filter((item) => item.passed).length,
  failed_count: results.filter((item) => !item.passed).length,
  results,
  passed: results.every((item) => item.passed),
};
fs.writeFileSync(path.join(ROOT, "reports/post-phase-m-local-test-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Post-Phase M tests: ${report.passed ? "PASS" : "HOLD"} (${report.passed_count}/${report.test_count})`);
if (!report.passed) process.exitCode = 1;
