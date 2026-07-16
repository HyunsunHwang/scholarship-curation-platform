import fs from "node:fs";
import path from "node:path";
import { parseJsonWithDuplicateKeyCheck } from "../lib/post-phase-l/strict-json.mjs";

const ROOT = process.cwd();
const json = (file) => parseJsonWithDuplicateKeyCheck(
  fs.readFileSync(path.join(ROOT, file), "utf8"),
  file,
).value;

const cycle1 = json("reports/post-phase-m-live/cycle-1/cycle-report.json");
const cycle2 = json("reports/post-phase-m-live/cycle-2/cycle-report.json");
const sourceHealth = json("reports/post-phase-m-source-health.json");
const review = json("reports/post-phase-m-review-operations.json");
const recovery = json("reports/post-phase-m-incident-recovery.json");
const runtime = json("reports/post-phase-m-runtime-verification.json");
const expectedSources = ["cau_001", "cau_002", "yonsei_060", "cau_003", "cau_007", "cau_008"];

const checks = {
  cycle_count: [cycle1, cycle2].length === 2,
  cycle_source_results_complete: [cycle1, cycle2].every((cycle) =>
    cycle.cycle_source_results_complete === true &&
    expectedSources.every((source) => cycle.source_results.filter((item) => item.source_key === source).length === 1)),
  live_positive_control_preserved: sourceHealth.sources.find((item) => item.source_key === "cau_001")?.health === "healthy",
  source_health_classification_complete: sourceHealth.sources.length === 6 &&
    sourceHealth.sources.every((item) => ["healthy", "degraded", "blocked", "unresolved", "zero_match_observed", "recovered", "regressed"].includes(item.health)),
  duplicate_counts_zero: [cycle1, cycle2].every((cycle) =>
    cycle.duplicate_notice_count === 0 && cycle.duplicate_occurrence_count === 0 && cycle.duplicate_alias_count === 0),
  source_identity_fail_closed: [cycle1, cycle2].every((cycle) =>
    cycle.exact_source_resolution_passed === true && cycle.fuzzy_source_match_count === 0 && cycle.automatic_source_create_count === 0),
  review_lifecycle: review.append_only_review_event_count >= 2 && review.effective_approve_source_count >= 1,
  recovery: recovery.rollback_rehearsed === true && recovery.reapply_passed === true &&
    recovery.post_reapply_replay_match === true && recovery.unrelated_table_change_count === 0,
  safety: runtime.public_leakage_count === 0 && runtime.automatic_public_publish_count === 0 &&
    runtime.production_read_performed === false && runtime.production_write_performed === false &&
    runtime.external_llm_call_count === 0,
};

const passed = Object.values(checks).every(Boolean) && runtime.passed === true;
console.log(JSON.stringify({ passed, checks }, null, 2));
if (!passed) process.exitCode = 1;
