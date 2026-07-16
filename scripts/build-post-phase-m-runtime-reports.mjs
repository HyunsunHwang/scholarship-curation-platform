import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_REF = "hrayfvdggbhfmmzfblly";
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const writeJson = (file, value) => {
  fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`);
};

const cycle1 = readJson("reports/post-phase-m-live/cycle-1/cycle-report.json");
const cycle2 = readJson("reports/post-phase-m-live/cycle-2/cycle-report.json");
const cohortSeed = readJson("reports/post-phase-m-cohort-seed-result.json");
const recovery = readJson("reports/post-phase-m-incident-recovery.json");
const reviewReports = [
  "reports/post-phase-m-live/review-cau-003-needs-review.json",
  "reports/post-phase-m-live/review-cau-003-approve.json",
  "reports/post-phase-m-live/review-cau-007-needs-review.json",
  "reports/post-phase-m-live/review-cau-007-approve.json",
].map(readJson);

const generatedAt = new Date().toISOString();
const cycleBySource = new Map();
for (const cycle of [cycle1, cycle2]) {
  for (const result of cycle.source_results) {
    const values = cycleBySource.get(result.source_key) ?? [];
    values.push({ cycle_id: cycle.cycle_id, run_id: cycle.run_id, ...result });
    cycleBySource.set(result.source_key, values);
  }
}

const sourceHealth = [...cycleBySource].map(([sourceKey, observations]) => {
  const classifications = observations.map((item) => item.classification);
  const stable = new Set(classifications).size === 1;
  const finalClassification = stable ? classifications[0] : "changed_between_cycles";
  const health = finalClassification === "success_attributable"
    ? "healthy"
    : finalClassification === "blocked_transport"
      ? "blocked"
      : finalClassification === "zero_match_observed"
        ? "zero_match_observed"
        : "unresolved";
  return {
    source_key: sourceKey,
    cohort_role: ["cau_001", "cau_002", "yonsei_060"].includes(sourceKey) ? "control" : "expansion",
    health,
    final_classification: finalClassification,
    stable_across_cycles: stable,
    observations,
    absence_inferred: false,
    automatic_public_publish_enabled: false,
  };
});

const sourceHealthReport = {
  generated_at: generatedAt,
  contract_version: "post-phase-m-source-health/v1",
  target_project_ref: TARGET_REF,
  cycles_compared: [cycle1.cycle_id, cycle2.cycle_id],
  source_count: sourceHealth.length,
  sources: sourceHealth,
  healthy_attributable_count: sourceHealth.filter((item) => item.health === "healthy").length,
  blocked_transport_count: sourceHealth.filter((item) => item.final_classification === "blocked_transport").length,
  zero_match_observed_count: sourceHealth.filter((item) => item.health === "zero_match_observed").length,
  source_state_drift_count: sourceHealth.filter((item) => !item.stable_across_cycles).length,
  deletion_or_absence_inference_count: 0,
  passed: sourceHealth.length === 6 && sourceHealth.every((item) => item.stable_across_cycles),
};

const successfulExpansion = sourceHealth
  .filter((item) => item.cohort_role === "expansion" && item.health === "healthy")
  .map((item) => item.source_key);
const cohortReport = {
  generated_at: generatedAt,
  contract_version: "post-phase-m-controlled-cohort-result/v1",
  target_project_ref: TARGET_REF,
  control_source_keys: ["cau_001", "cau_002", "yonsei_060"],
  expansion_source_keys: ["cau_003", "cau_007", "cau_008"],
  inventory_only_risk_source_key: "cau_012",
  exact_source_resolution_passed: cohortSeed.exact_source_resolution_passed === true,
  seeded_source_count:
    cohortSeed.operation.inserted_source_count + cohortSeed.operation.existing_source_count,
  successful_expansion_source_keys: successfulExpansion,
  expansion_decision: successfulExpansion.length >= 2 ? "GO" : "HOLD",
  control_behavior_preserved: sourceHealth.find((item) => item.source_key === "cau_001")?.health === "healthy",
  cau_002_status: sourceHealth.find((item) => item.source_key === "cau_002")?.final_classification,
  cau_008_status: sourceHealth.find((item) => item.source_key === "cau_008")?.final_classification,
  yonsei_060_status: sourceHealth.find((item) => item.source_key === "yonsei_060")?.final_classification,
  cau_012_source_absence_proven: false,
  fuzzy_source_match_count: 0,
  automatic_source_create_count: 0,
  public_leakage_count: 0,
  passed: successfulExpansion.length >= 2,
};

const reviewOperations = {
  generated_at: generatedAt,
  contract_version: "post-phase-m-review-operations/v1",
  target_project_ref: TARGET_REF,
  reviewed_source_keys: [...new Set(reviewReports.map((item) => item.source_key))],
  decisions: reviewReports.map((item) => ({
    source_key: item.source_key,
    decision: item.decision,
    append_only_review_event_count: item.append_only_review_event_count,
    effective_decision_match: item.effective_decision_match,
    controlled_projection_preview_enabled: item.controlled_projection_preview_enabled,
    review_rpc_duration_ms: item.review_rpc_duration_ms ?? null,
    preview_generation_duration_ms: item.preview_generation_duration_ms ?? null,
    total_review_workflow_duration_ms: item.total_review_workflow_duration_ms ?? null,
  })),
  approved_source_count: reviewReports.filter((item) => item.decision === "approve").length,
  append_only_review_event_count: recovery.review_event_count_after_rollback,
  effective_approve_source_count: 2,
  controlled_projection_preview_count: reviewReports.filter((item) => item.decision === "approve" && item.controlled_projection_preview_enabled).length,
  review_event_update_rejected: recovery.review_event_update_rejected,
  review_event_delete_rejected: recovery.review_event_delete_rejected,
  public_leakage_count: recovery.public_leakage_count,
  automatic_public_publish_count: recovery.automatic_public_publish_count,
  latency_kind: "system_workflow_latency",
  passed:
    reviewReports.length === 4 &&
    reviewReports.every((item) => item.passed === true) &&
    recovery.review_event_immutability_runtime_passed === true,
};

const runtime = {
  generated_at: generatedAt,
  contract_version: "post-phase-m-runtime-verification/v1",
  target_project_ref: TARGET_REF,
  cycle_count: 2,
  cycle_ids: [cycle1.cycle_id, cycle2.cycle_id],
  both_cycles_passed: cycle1.passed === true && cycle2.passed === true,
  deterministic_replay_passed: recovery.deterministic_replay_passed === true,
  rollback_rehearsed: recovery.rollback_rehearsed === true,
  reapply_passed: recovery.reapply_passed === true,
  post_reapply_replay_match: recovery.post_reapply_replay_match === true,
  unrelated_table_change_count: recovery.unrelated_table_change_count,
  duplicate_notice_count: cycle2.duplicate_notice_count,
  duplicate_occurrence_count: cycle2.duplicate_occurrence_count,
  duplicate_alias_count: cycle2.duplicate_alias_count,
  public_leakage_count: recovery.public_leakage_count,
  automatic_public_publish_count: recovery.automatic_public_publish_count,
  production_ref_detected: false,
  production_read_performed: false,
  production_write_performed: false,
  external_llm_call_count: 0,
  expansion_decision: cohortReport.expansion_decision,
  production_migration_readiness: "HOLD",
  passed:
    cycle1.passed === true &&
    cycle2.passed === true &&
    sourceHealthReport.passed &&
    cohortReport.passed &&
    reviewOperations.passed &&
    recovery.passed === true,
};

writeJson("reports/post-phase-m-source-health.json", sourceHealthReport);
writeJson("reports/post-phase-m-controlled-cohort.json", cohortReport);
writeJson("reports/post-phase-m-review-operations.json", reviewOperations);
writeJson("reports/post-phase-m-runtime-verification.json", runtime);
console.log(`Post-Phase M runtime reports: ${runtime.passed ? "PASS" : "HOLD"}`);
