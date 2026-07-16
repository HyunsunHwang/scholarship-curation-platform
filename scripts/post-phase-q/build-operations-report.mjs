import fs from "node:fs";
import path from "node:path";
import { createAuditRecord } from "../../lib/post-phase-n-q/audit.mjs";

const ROOT = process.cwd();
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const fingerprint = readJson(
  "reports/post-phase-n-q/nonproduction-fingerprint.json",
);
const health = readJson("reports/post-phase-n-q/source-health.json");
const semantic = readJson(
  "reports/post-phase-n-q/semantic-corpus-report.json",
);
const invariantsPath = path.join(
  ROOT,
  "reports/post-phase-n-q/nonproduction-invariants.json",
);
const invariants = fs.existsSync(invariantsPath)
  ? readJson("reports/post-phase-n-q/nonproduction-invariants.json")
  : null;

const countFor = (table) =>
  fingerprint.aggregates.row_counts.find((item) => item.table === table)?.count ??
  0;
const distribution = (table, column) =>
  fingerprint.aggregates.state_distributions.find(
    (item) => item.table === table && item.column === column,
  )?.values ?? {};
const decision = distribution("review_decision_events", "decision");
const recentIncidents = health.sources
  .filter((source) => source.status !== "SUCCESS")
  .map((source) => ({
    source_key: source.source_key,
    status: source.status,
    severity: source.status === "SELECTOR_CHANGED" ? "warning" : "info",
  }));
const generatedAt = new Date().toISOString();
const auditSamples = [
  createAuditRecord({
    actor: "post-phase-n-q-validator",
    role: "System",
    action: "invariant_check",
    target: "approved_nonproduction",
    timestamp: generatedAt,
    reason: "Beta operations readiness verification",
    result: invariants?.passed ? "pass" : "limited",
    metadata: {
      report_path: "reports/post-phase-n-q/nonproduction-invariants.json",
      secrets: "must be redacted",
    },
  }),
];
const report = {
  generated_at: generatedAt,
  contract_version: "post-phase-q-operations-readiness/v1",
  evidence_kind: "database_nonproduction",
  roles: [
    {
      role: "Reviewer",
      responsibilities: [
        "Review candidates",
        "Record approve, reject, or insufficient evidence decisions",
      ],
    },
    {
      role: "Operator",
      responsibilities: [
        "Monitor crawler and source health",
        "Run guarded non-production projector",
        "Contain incidents and request canary stop",
      ],
    },
    {
      role: "Owner",
      responsibilities: [
        "Authorize production read, migration, canary, rollback, and inventory decisions",
      ],
    },
  ],
  authorization_model:
    "Current user/admin RLS is preserved. Reviewer and Operator are responsibility assignments within admin until production fingerprint and owner-approved least-privilege schema changes.",
  audit_model: {
    append_only_review_events_reused: true,
    projector_and_operator_evidence: "machine-readable repository reports",
    persistent_cross_operation_audit_table:
      "CONDITIONAL_ON_PRODUCTION_FINGERPRINT",
    sample_records: auditSamples,
  },
  metrics: {
    recent_crawler_run_count: countFor("ingestion_crawl_runs"),
    source_count: health.sources.length,
    new_candidate_count: countFor("review_items"),
    pending_review_count: decision.needs_review ?? 0,
    approved_count: decision.approve ?? 0,
    rejected_count: decision.reject ?? 0,
    insufficient_count: semantic.fixture_items.filter(
      (item) => item.predicted === "insufficient_evidence",
    ).length,
    active_public_scholarship_count:
      invariants?.active_public_scholarship_count ?? 0,
    projection_failure_count: invariants
      ? invariants.public_row_without_effective_approve_count +
        invariants.rejected_or_withdrawn_public_leakage_count
      : 0,
    recent_incident_count: recentIncidents.length,
  },
  recent_incidents: recentIncidents,
  empty_state_copy:
    "데이터가 없으면 0건과 마지막 검증 시각을 표시하며 fixture를 production 현황으로 표시하지 않습니다.",
  production_access_performed: false,
  production_write_performed: false,
  external_alert_service_connected: false,
  notification_integration_point:
    "Consume reports/post-phase-n-q/nonproduction-invariants.json in an owner-approved alert sink.",
  passed: Boolean(invariants?.passed),
};
fs.writeFileSync(
  path.join(ROOT, "reports/post-phase-n-q/operations-readiness.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  passed: report.passed,
  metrics: report.metrics,
  output_path: "reports/post-phase-n-q/operations-readiness.json",
}, null, 2));
if (!report.passed) process.exitCode = 1;
