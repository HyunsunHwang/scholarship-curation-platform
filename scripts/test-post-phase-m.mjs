import fs from "node:fs";
import path from "node:path";
import { buildPostPhaseMCohortPlan } from "../lib/post-phase-m/controlled-cohort.mjs";
import { classifyScholarshipRelevance } from "../lib/post-phase-m/scholarship-relevance.mjs";
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
const semantic = json("reports/post-phase-m-semantic-reevaluation.json");
const cohort = json("reports/post-phase-m-controlled-cohort.json");
const review = json("reports/post-phase-m-review-operations.json");
const semanticReviewSql = fs.readFileSync(
  path.join(ROOT, "supabase/post-phase-m/001_post_phase_m_semantic_review_correction.sql"),
  "utf8",
);

const requiredNegative = classifyScholarshipRelevance({
  title: "외국인 유학생 등록금 납부 관련 유의사항 안내",
  body: "불법 환전, 가상계좌, 송금 및 등록금 납부 보안 안내",
});
const requiredPositive = classifyScholarshipRelevance({
  title: "2026학년도 장학생 선발 및 장학금 지원 안내",
  body: "신청 자격을 충족한 학생에게 등록금 감면 혜택을 지급합니다.",
});
const contextualOnly = classifyScholarshipRelevance({
  title: "등록금 관련 학사 일정",
  body: "학사 일정 참고 자료입니다.",
});
const insufficientEvidence = classifyScholarshipRelevance({
  title: "학과 행사 안내",
  body: "행사 장소와 시간을 안내합니다.",
});

test("exact six-source cohort", plan.exact_source_resolution_passed && plan.source_count === 6, plan.source_keys);
test("no fuzzy source matching", plan.fuzzy_source_match_count === 0, plan.fuzzy_source_match_count);
test("cau_012 remains inventory-only", plan.inventory_only_risk.source_inventory_status === "absent" && plan.inventory_only_risk.source_absence_proven === false, plan.inventory_only_risk);
test("bounded cycle limits", [cycle1, cycle2].every((cycle) => cycle.crawl_bounds.max_items_per_source <= 30 && cycle.crawl_bounds.max_pages_per_source <= 5 && cycle.crawl_bounds.source_concurrency === 1), [cycle1.crawl_bounds, cycle2.crawl_bounds]);
test("positive control is repeatable", [cycle1, cycle2].every((cycle) => cycle.source_results.find((item) => item.source_key === "cau_001")?.classification === "success_attributable"), "cau_001");
test("expansion adapter attribution remains explicit", ["cau_003", "cau_007"].every((source) => health.sources.find((item) => item.source_key === source)?.attribution_health === "healthy"), ["cau_003", "cau_007"]);
test("standalone tuition security notice is rejected", requiredNegative.scholarship_relevance_classification === "false_positive" && requiredNegative.approval_allowed === false, requiredNegative);
test("scholarship support opportunity is positive", requiredPositive.scholarship_relevance_classification === "scholarship_true_positive" && requiredPositive.approval_allowed === true, requiredPositive);
test("tuition context without opportunity stays contextual", contextualOnly.scholarship_relevance_classification === "contextual_only" && contextualOnly.approval_allowed === false, contextualOnly);
test("unrelated notice remains insufficient evidence", insufficientEvidence.scholarship_relevance_classification === "insufficient_evidence" && insufficientEvidence.approval_allowed === false, insufficientEvidence);
test("all matched items carry semantic evidence", semantic.matched_items.every((item) =>
  typeof item.attribution_verified === "boolean" &&
  typeof item.scholarship_relevance_classification === "string" &&
  Array.isArray(item.scholarship_relevance_reason_codes) &&
  Array.isArray(item.positive_evidence) &&
  Array.isArray(item.negative_evidence) &&
  typeof item.reviewer_disposition === "string"
), semantic.matched_item_count);
test("cau_001 is semantic positive control", semantic.cau_001_positive_control_preserved === true, "cau_001");
test("contextual false positives corrected append-only", semantic.contextual_false_positive_corrected_count >= 2 && semantic.approved_false_positive_count === 0 && semantic.effective_false_positive_decision === "reject", semantic.corrected_false_positive_source_keys);
test("semantic reject RPC patch is environment-guarded", semanticReviewSql.includes("post_phase_l_assert_environment") && semanticReviewSql.includes("promoted linked legacy notice can receive reject") && semanticReviewSql.includes("authenticated_review_rpc_execute_preserved"), "guarded non-production SQL patch");
test("expansion decision is truthful HOLD", cohort.cohort_expansion_decision === "HOLD" && cohort.scholarship_true_positive_expansion_count === 0, cohort.cohort_expansion_decision);
test("transport is not zero-match", health.sources.find((item) => item.source_key === "cau_002")?.final_classification === "blocked_transport", "cau_002");
test("zero-match does not infer absence", health.deletion_or_absence_inference_count === 0, health.deletion_or_absence_inference_count);
test("cycle duplicate invariants", [cycle1, cycle2].every((cycle) => cycle.duplicate_notice_count + cycle.duplicate_occurrence_count + cycle.duplicate_alias_count === 0), "all duplicate counts zero");
test("review events are immutable", recovery.review_event_update_rejected && recovery.review_event_delete_rejected, "update/delete rejected");
test("data-bearing bounded rollback row counts", recovery.data_bearing_fixture === true && [
  "deleted_run_count", "deleted_source_result_count", "deleted_graph_notice_count",
  "deleted_occurrence_count", "deleted_revision_count", "deleted_compatibility_count",
].every((key) => recovery[key] >= 1), recovery.rollback_run_id);
test("data-bearing deterministic reapply", recovery.reapply_passed && recovery.post_reapply_replay_match && [
  "reapplied_run_count", "reapplied_source_result_count", "reapplied_graph_notice_count",
  "reapplied_occurrence_count", "reapplied_revision_count", "reapplied_compatibility_count",
].every((key) => recovery[key] >= 1), recovery.rollback_run_id);
test("recovery preserves unrelated and immutable evidence", recovery.unrelated_run_preserved && recovery.unrelated_compatibility_rows_preserved && recovery.review_events_preserved && recovery.unrelated_table_change_count === 0, "unrelated state preserved");
test("review latency nulls are explained", review.decisions.every((item) => item.total_review_workflow_duration_ms != null || item.measurement_unavailable_reason), "measured or explained");
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
