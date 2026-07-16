import fs from "node:fs";
import path from "node:path";
import { classifyScholarshipRelevance } from "../lib/post-phase-m/scholarship-relevance.mjs";

const ROOT = process.cwd();
const TARGET_REF = "hrayfvdggbhfmmzfblly";
const EXPANSION_SOURCES = new Set(["cau_003", "cau_007", "cau_008"]);
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const writeJson = (file, value) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`);

const cycles = [1, 2].map((number) => ({
  number,
  cycle: readJson(`reports/post-phase-m-live/cycle-${number}/cycle-report.json`),
  crawler: readJson(`reports/post-phase-m-live/cycle-${number}/crawler/scholarship-notices-latest.json`),
}));
const rejectReports = ["cau-003", "cau-007"].map((source) =>
  readJson(`reports/post-phase-m-live/review-${source}-reject.json`),
);

const matchedItems = cycles.flatMap(({ number, cycle, crawler }) =>
  crawler.newNotices.map((notice) => {
    const sourceResult = cycle.source_results.find((item) => item.source_key === notice.sourceId);
    const relevance = classifyScholarshipRelevance({
      title: notice.title,
      body: notice.content,
      attributionVerified:
        sourceResult?.classification === "success_attributable" &&
        Boolean(notice.noticeUrl) &&
        Boolean(notice.content),
    });
    return {
      cycle_id: cycle.cycle_id,
      cycle_number: number,
      run_id: cycle.run_id,
      source_key: notice.sourceId,
      cohort_role: EXPANSION_SOURCES.has(notice.sourceId) ? "expansion" : "control",
      title: notice.title,
      detail_url: notice.noticeUrl,
      list_url: notice.listUrl,
      raw_date_text: notice.dateText,
      body_evidence_present: Boolean(notice.content),
      adapter_classification: sourceResult?.classification ?? "missing",
      ...relevance,
    };
  }),
);

const latestBySource = new Map();
for (const item of matchedItems) latestBySource.set(item.source_key, item);
const sourceRelevance = [...latestBySource.values()].map((item) => ({
  source_key: item.source_key,
  cohort_role: item.cohort_role,
  attribution_verified: item.attribution_verified,
  adapter_classification: item.adapter_classification,
  scholarship_relevance_classification: item.scholarship_relevance_classification,
  scholarship_relevance_reason_codes: item.scholarship_relevance_reason_codes,
  approval_allowed: item.approval_allowed,
}));
const expansion = sourceRelevance.filter((item) => item.cohort_role === "expansion");
const falsePositiveSources = expansion
  .filter((item) => item.scholarship_relevance_classification === "false_positive")
  .map((item) => item.source_key);
const effectiveRejectSources = rejectReports
  .filter((item) => item.passed === true && item.effective_decision === "reject")
  .map((item) => item.source_key);
const correctedSources = falsePositiveSources.filter((source) => effectiveRejectSources.includes(source));
const attributedExpansionSourceCount = expansion.filter((item) => item.attribution_verified).length;
const truePositiveExpansion = expansion.filter(
  (item) => item.scholarship_relevance_classification === "scholarship_true_positive",
);
const contextualExpansion = expansion.filter(
  (item) => item.scholarship_relevance_classification === "contextual_only",
);
const falsePositiveExpansion = expansion.filter(
  (item) => item.scholarship_relevance_classification === "false_positive",
);
const approvedFalsePositiveCount = falsePositiveSources.filter(
  (source) => !effectiveRejectSources.includes(source),
).length;
const reviewComplete =
  matchedItems.length > 0 &&
  matchedItems.every((item) => [
    "scholarship_true_positive",
    "contextual_only",
    "false_positive",
    "insufficient_evidence",
  ].includes(item.scholarship_relevance_classification)) &&
  correctedSources.length === falsePositiveSources.length;
const cohortExpansionDecision =
  truePositiveExpansion.length >= 1 && approvedFalsePositiveCount === 0 ? "GO" : "HOLD";

const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-m-semantic-reevaluation/v1",
  target_project_ref: TARGET_REF,
  evidence_kind: "live_cycle_semantic_reevaluation",
  original_cycle_evidence_preserved: true,
  bounded_rerun_performed: false,
  bounded_rerun_not_required_reason: "The two retained cycles contain attributable list, detail, date, and body evidence sufficient for deterministic semantic re-evaluation.",
  production_detector_modified: false,
  production_port_plan: "Port the reason-coded relevance gate only after corpus review, threshold ownership, shadow evaluation, and an independently approved production change.",
  matched_item_count: matchedItems.length,
  matched_items: matchedItems,
  source_relevance: sourceRelevance,
  attributed_expansion_source_count: attributedExpansionSourceCount,
  scholarship_true_positive_expansion_count: truePositiveExpansion.length,
  scholarship_true_positive_expansion_source_keys: truePositiveExpansion.map((item) => item.source_key),
  contextual_only_expansion_count: contextualExpansion.length,
  contextual_only_expansion_source_keys: contextualExpansion.map((item) => item.source_key),
  false_positive_expansion_count: falsePositiveExpansion.length,
  false_positive_expansion_source_keys: falsePositiveSources,
  approved_false_positive_count: approvedFalsePositiveCount,
  contextual_false_positive_corrected_count: correctedSources.length,
  corrected_false_positive_source_keys: correctedSources,
  effective_false_positive_decision: correctedSources.length === falsePositiveSources.length ? "reject" : "unresolved",
  scholarship_relevance_review_complete: reviewComplete,
  cohort_expansion_decision: cohortExpansionDecision,
  cau_001_positive_control_preserved: sourceRelevance.some(
    (item) => item.source_key === "cau_001" &&
      item.scholarship_relevance_classification === "scholarship_true_positive",
  ),
  cau_002_status_preserved: cycles.every(({ cycle }) =>
    cycle.source_results.find((item) => item.source_key === "cau_002")?.classification === "blocked_transport",
  ),
  zero_match_statuses_preserved: ["cau_008", "yonsei_060"].every((source) =>
    cycles.every(({ cycle }) =>
      cycle.source_results.find((item) => item.source_key === source)?.classification === "zero_match_observed",
    ),
  ),
  public_leakage_count: Math.max(...rejectReports.map((item) => item.public_leakage_count ?? 0)),
  automatic_public_publish_count: Math.max(...rejectReports.map((item) => item.automatic_public_publish_count ?? 0)),
  passed:
    reviewComplete &&
    correctedSources.length >= 2 &&
    approvedFalsePositiveCount === 0 &&
    cohortExpansionDecision === "HOLD" &&
    rejectReports.every((item) => item.superseding_event_added === true) &&
    rejectReports.every((item) => item.superseded_hidden_preview_preserved === true) &&
    rejectReports.every((item) => item.public_leakage_count === 0),
};

writeJson("reports/post-phase-m-semantic-reevaluation.json", report);
console.log(`Post-Phase M semantic re-evaluation: ${report.passed ? "PASS" : "HOLD"}`);
if (!report.passed) process.exitCode = 1;
