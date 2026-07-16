import fs from "node:fs";
import path from "node:path";
import { classifyScholarshipRelevance } from "../../lib/post-phase-m/scholarship-relevance.mjs";

const ROOT = process.cwd();
const corpus = JSON.parse(
  fs.readFileSync(path.join(ROOT, "fixtures/post-phase-n-q/semantic-corpus.json"), "utf8"),
);
const liveEvidence = JSON.parse(
  fs.readFileSync(path.join(ROOT, "reports/post-phase-m-semantic-reevaluation.json"), "utf8"),
);

function metrics(items) {
  const positive = (value) => value === "scholarship_true_positive";
  const tp = items.filter((item) => positive(item.expected) && positive(item.predicted)).length;
  const fp = items.filter((item) => !positive(item.expected) && positive(item.predicted)).length;
  const fn = items.filter((item) => positive(item.expected) && !positive(item.predicted)).length;
  const tn = items.length - tp - fp - fn;
  return {
    item_count: items.length,
    true_positive: tp,
    false_positive: fp,
    false_negative: fn,
    true_negative: tn,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    arithmetic_consistent: tp + fp + fn + tn === items.length,
  };
}

const fixtureItems = corpus.cases.map((item) => {
  const result = classifyScholarshipRelevance({
    title: item.title,
    body: item.body,
    attributionVerified: true,
  });
  return {
    ...item,
    predicted: result.scholarship_relevance_classification,
    approval_allowed: result.approval_allowed,
    reason_codes: result.scholarship_relevance_reason_codes,
  };
});
const liveItems = liveEvidence.matched_items.map((item) => {
  const result = classifyScholarshipRelevance({
    title: item.title,
    body: [
      ...item.positive_evidence.map((evidence) => evidence.value),
      ...item.negative_evidence.map((evidence) => evidence.value),
    ].join(" "),
    attributionVerified: item.attribution_verified,
  });
  return {
    id: `${item.cycle_id}:${item.source_key}:${item.title}`,
    source_key: item.source_key,
    title: item.title,
    expected: item.scholarship_relevance_classification,
    predicted: result.scholarship_relevance_classification,
    approval_allowed: result.approval_allowed,
    label_provenance: "existing_human_review",
    evidence_kind: "live_public",
  };
});
const fixtureMetrics = metrics(fixtureItems);
const liveMetrics = metrics(liveItems);
const combinedMetrics = metrics([...fixtureItems, ...liveItems]);
const hardNegativePublicCount = fixtureItems.filter(
  (item) =>
    item.expected !== "scholarship_true_positive" && item.approval_allowed,
).length;
const insufficientAutomaticApprovalCount = fixtureItems.filter(
  (item) => item.expected === "insufficient_evidence" && item.approval_allowed,
).length;
const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-p-semantic-corpus-report/v1",
  evidence_kind: "fixture",
  corpus_label_caveat:
    "analyst_curated_provisional labels are not independent human ground truth.",
  fixture_metrics: fixtureMetrics,
  live_metrics: liveMetrics,
  combined_metrics: combinedMetrics,
  per_class_count: Object.fromEntries(
    ["scholarship_true_positive", "contextual_only", "false_positive", "insufficient_evidence"].map(
      (classification) => [
        classification,
        fixtureItems.filter((item) => item.expected === classification).length,
      ],
    ),
  ),
  hard_negative_automatic_public_projection_count: hardNegativePublicCount,
  insufficient_evidence_automatic_approval_count:
    insufficientAutomaticApprovalCount,
  target_precision: 0.9,
  target_recall: 0.85,
  threshold_passed:
    combinedMetrics.precision >= 0.9 &&
    combinedMetrics.recall >= 0.85 &&
    hardNegativePublicCount === 0 &&
    insufficientAutomaticApprovalCount === 0,
  fixture_items: fixtureItems,
  live_items: liveItems,
  production_detector_modified: false,
  automatic_public_publish_count: 0,
};
fs.writeFileSync(
  path.join(ROOT, "reports/post-phase-n-q/semantic-corpus-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  passed: report.threshold_passed,
  precision: report.combined_metrics.precision,
  recall: report.combined_metrics.recall,
  hard_negative_automatic_public_projection_count:
    report.hard_negative_automatic_public_projection_count,
  output_path: "reports/post-phase-n-q/semantic-corpus-report.json",
}, null, 2));
if (!report.threshold_passed) process.exitCode = 1;
