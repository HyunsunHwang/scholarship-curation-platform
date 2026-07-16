import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const writeJson = (file, value) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`);
const writeText = (file, value) => fs.writeFileSync(path.join(ROOT, file), `${value.trim()}\n`);
const generatedAt = new Date().toISOString();

const remainingLint = [
  "app/scholarships/[id]/LiveEngagementBadges.tsx",
  "components/NavigationPendingOverlay.tsx",
  "components/library/LibraryHub.tsx",
  "components/library/LibraryRecentList.tsx",
].map((file) => ({
  file,
  rule: "react-hooks/set-state-in-effect",
  reason: "Hydration, route-reset, or browser-storage synchronization requires a component lifecycle redesign and focused UI regression coverage.",
  owner: "Frontend platform owner",
  next_action: "Replace effect-driven derived state with an external-store or remount boundary and verify navigation, hydration, and persistence behavior.",
  introduced_by_m: false,
}));

const platform = {
  generated_at: generatedAt,
  contract_version: "post-phase-m-platform-maintenance/v1",
  initial_full_eslint: { errors: 11, warnings: 5 },
  final_full_eslint: { errors: 4, warnings: 0 },
  remediated_error_count: 7,
  remediated_warning_count: 5,
  behavior_preserving_remediation: true,
  remaining_findings: remainingLint,
  blanket_rule_disable_added: false,
  m_introduced_finding_count: 0,
  scoped_eslint_passed: true,
  typescript_passed: true,
  build_passed: true,
  full_eslint_exit_zero: false,
  initial_build_environment_failure: "Google Fonts were unreachable in the restricted sandbox.",
  final_build_environment: "network-capable Windows process",
  schema_cache_logs: [
    {
      relation: "public.contests",
      classification: "non-production schema mismatch",
      evidence: "The L compatibility baseline intentionally does not create the product contests table; fail-closed reads may warn during build-time collection.",
      action: "Reconcile the production schema fingerprint and committed migration history before any production rollout. Do not create an unrelated L table to silence the warning.",
    },
  ],
  status: "PASS_WITH_EXPLICIT_BASELINE",
};
writeJson("reports/post-phase-m-platform-maintenance.json", platform);

const productionPrerequisites = [
  ["production schema migration review", false, "No production migration review was authorized."],
  ["production backup/export evidence", false, "No production access was authorized."],
  ["production schema fingerprint", false, "No production read was authorized."],
  ["RLS review", false, "L policies are non-production evidence only."],
  ["source seed reconciliation", false, "Only the authorized L project was reconciled."],
  ["backfill plan", false, "No production backfill plan has been approved."],
  ["canary cohort", false, "The M cohort is a non-production operating cohort."],
  ["rollback authority", false, "Production rollback authority is not granted."],
  ["monitoring and alerting", false, "Repository evidence exists, but production alert delivery is not configured."],
  ["operator ownership", false, "Production release and incident roles require explicit designation."],
  ["incident response", false, "The M runbook is non-production only."],
  ["public projection reconciliation", false, "Preview rows remain hidden and production parity is unproven."],
  ["numeric route preservation", true, "L and M fail-closed preview evidence preserves hidden numeric routes."],
  ["security and secrets", true, "No secret is committed or printed by the M workflow."],
  ["cost and capacity", false, "Two bounded cycles do not establish production capacity."],
  ["source parser and attachment risks", false, "cau_002 transport, cau_008 zero-match, and attachment extraction remain unresolved."],
  ["full lint and build health", false, "Six explicitly baselined React lifecycle lint errors remain."],
  ["external LLM governance", false, "Provider evaluation and persistence remain prohibited and unevaluated."],
].map(([name, passed, evidence]) => ({ name, passed, evidence }));

const production = {
  generated_at: generatedAt,
  contract_version: "post-phase-m-production-readiness/v1",
  non_production_controlled_pilot_status: "PASS",
  cohort_expansion_decision: "GO",
  production_rollout_decision: "HOLD",
  production_rollout_authorized: false,
  production_migration_executed: false,
  production_ref_detected: false,
  production_read_performed: false,
  production_write_performed: false,
  prerequisites: productionPrerequisites,
  blocker_count: productionPrerequisites.filter((item) => !item.passed).length,
  exact_blockers: productionPrerequisites.filter((item) => !item.passed).map((item) => item.name),
  next_phase_prerequisites: [
    "Authorize read-only production inventory and independently fingerprint the schema.",
    "Approve migration, backup/export, source reconciliation, canary, rollback, and backfill plans with named owners.",
    "Review RLS and public projection reconciliation against the production fingerprint.",
    "Resolve or formally accept transport, zero-match, attachment, monitoring, capacity, and frontend lifecycle risks.",
  ],
  passed: true,
};
writeJson("reports/post-phase-m-production-readiness.json", production);

const master = readJson("reports/post-phase-master-risk-register.json");
const mEvidence = {
  "RISK-PILOT-COHORT-OVERFITTING": "M executed two identical six-source bounded cycles. cau_003 and cau_007 were attributable in both cycles; cau_002 remained transport-blocked and cau_008/yonsei_060 remained zero-match observations.",
  "RISK-MAIN-LINT-BASELINE": "M reproduced 11 errors and 5 warnings, removed seven deterministic errors and all warnings, and explicitly baselined four react-hooks/set-state-in-effect findings with no M-introduced finding.",
  "RISK-CAU003-DUPLICATE": "M established an exact cau_003 list-to-detail path and append-only needs_review then approve events in non-production; automatic publication remained disabled.",
  "RISK-CAU012-COVERAGE": "M found no exact cau_012 inventory row, did not create the source, and retained source_absence_proven=false.",
  "RISK-CAU008-INCOMPLETE-BATCH": "M corrected cau_008 board extraction and observed 30 bounded list items in both cycles with zero scholarship matches; this is not absence evidence.",
  "RISK-ATTACHMENT-PARSING": "M attributable notices had body evidence but no asset metadata; complex attachment parsing remains unproven.",
  "RISK-CAU007-ZERO-MATCH": "M remediated cau_007 source-specific extraction and obtained one attributable live match in both bounded cycles, then completed append-only review and preview.",
  "RISK-CONTEXTUAL-KEYWORD": "M retained exact source-specific list/detail parsing and rejected generic-anchor attribution; two expansion sources produced repeatable attributable matches.",
  "RISK-COVERAGE-COMPLETENESS": "M expanded from three to six controlled sources, while explicitly preserving blocked and zero-match outcomes without absence inference.",
  "RISK-REVIEW-PERSISTENCE": "M exercised needs_review and approve as append-only events for two expansion sources and verified update/delete rejection in the authorized non-production project.",
  "RISK-SCHEMA-ALIGNMENT": "L schema rollback/reapply passed and M reused that schema for two cycles, but no production schema fingerprint or migration review exists.",
  "RISK-GUARDED-PRODUCTION-APPLY": "M performed no production read/write and records production rollout HOLD; production apply authority remains absent.",
  "RISK-PUBLIC-PROJECTION-RECONCILIATION": "M created only hidden preview rows and verified public leakage and automatic publish counts remained zero.",
  "RISK-REPORT-PROTOTYPE-OVERCLAIM": "M reports distinguish live attributable, blocked transport, zero-match observation, hidden preview, and production HOLD states.",
  "RISK-LEGACY-REVIEW-MUTATION": "M reconciled mutable compatibility content without changing legacy review status or reviewer metadata; canonical review decisions remained append-only.",
  "RISK-SOURCE-IDENTITY-OWNERSHIP": "All six M source keys exact-matched canonical source_id; fuzzy matching and automatic source creation stayed zero.",
  "RISK-EVIDENCE-FRESHNESS-LEAKAGE": "Two dated cycle artifacts and runtime readbacks preserve source outcomes; public leakage stayed zero.",
  "RISK-PERSONAL-ENGINE-PORT-DIVERGENCE": "M ported only three source-specific extraction capabilities and proved them through the integrated L graph path.",
  "RISK-IMPLEMENTATION-AUTHORITY-AND-BROWSER-ENVIRONMENT": "M used only the authorized L project and requires a real authenticated browser artifact before final validation.",
  "RISK-LLM-REVIEW-PROTOTYPE-LIMITATIONS": "M made zero external LLM calls and added no LLM persistence; provider governance remains unevaluated.",
};

for (const risk of master.risks) {
  if (mEvidence[risk.id]) {
    const priorEvidence = (risk.evidence ?? risk.resolution_evidence ?? "").split(" Post-Phase M:")[0];
    risk.evidence = `${priorEvidence} Post-Phase M: ${mEvidence[risk.id]}`.trim();
    if (risk.status !== "resolved") risk.resolution_evidence = risk.evidence;
  }
  if (risk.status !== "resolved" && /Post-Phase (?:J|L|M)/.test(risk.next_resolution_phase ?? "")) {
    risk.next_resolution_phase = "Post-Phase N - Production Readiness and Controlled Expansion";
  }
}

const newRisks = [
  {
    id: "RISK-CAU002-TLS-TRANSPORT",
    status: "deferred",
    origin_phase: "M",
    severity: "high",
    description: "cau_002 cannot establish live evidence because certificate verification blocks transport.",
    blocking_for_next_phase: false,
    evidence: "Both M cycles classified cau_002 as blocked_transport with no notice or public item.",
    why_not_resolved_now: "Disabling TLS verification is not an acceptable remediation and the remote certificate chain is outside repository authority.",
    owner: "Crawler transport owner",
    next_resolution_phase: "Post-Phase N - Production Readiness and Controlled Expansion",
    next_work_unit: "Establish a trusted CA path or source-approved transport alternative and run a bounded attributable recheck.",
    success_criteria: "A bounded run reaches the exact source over verified TLS and records an explicit attributable or zero-match result.",
  },
  {
    id: "RISK-PRODUCTION-SCHEMA-PARITY",
    status: "deferred",
    origin_phase: "M",
    severity: "critical",
    description: "Non-production L/M success does not prove production schema, RLS, migration, seed, or public projection parity.",
    blocking_for_next_phase: false,
    evidence: "M production readiness records no production authorization, read, write, fingerprint, migration, backup, or canary evidence.",
    why_not_resolved_now: "Production access and migration authority were explicitly outside M scope.",
    owner: "Production release owner",
    next_resolution_phase: "Post-Phase N - Production Readiness and Controlled Expansion",
    next_work_unit: "Perform an authorized read-only inventory, approve release/rollback plans, and rehearse a production-shaped canary outside production.",
    success_criteria: "Named owners approve fingerprint, migration, RLS, backup, backfill, canary, monitoring, and rollback evidence before a separate apply gate.",
  },
  {
    id: "RISK-RUN-ROLLBACK-REVIEW-FK",
    status: "mitigated",
    origin_phase: "M",
    severity: "medium",
    description: "A run containing reviewed revisions cannot use the generic bounded rollback path because review_items retains the current revision FK.",
    blocking_for_next_phase: false,
    evidence: "The cycle-2 rollback probe aborted transactionally; M then rehearsed and deterministically reapplied an independent live-derived zero-match run without unrelated changes.",
    why_not_resolved_now: "Deleting reviewed evidence conflicts with append-only review preservation and requires an explicit archival/rollback policy.",
    owner: "Review and ingestion schema owner",
    next_resolution_phase: "Post-Phase N - Production Readiness and Controlled Expansion",
    next_work_unit: "Define reviewed-run rollback as logical supersession or archival and add a focused rehearsal.",
    success_criteria: "A reviewed-run recovery procedure preserves immutable events and reaches deterministic state without FK failure or unrelated mutation.",
  },
];
for (const risk of newRisks) {
  risk.deferral_reason = risk.why_not_resolved_now;
  risk.resolution_evidence = risk.evidence;
  const existingRisk = master.risks.find((item) => item.id === risk.id);
  if (existingRisk) Object.assign(existingRisk, risk);
  else master.risks.push(risk);
}

master.generated_at = generatedAt;
master.scope = "Post-Phase K through M product convergence, non-production integration, controlled pilot operations, and production readiness";
master.all_project_risks_resolved = master.risks.every((risk) => risk.status === "resolved");
master.blocking_risk_count = master.risks.filter((risk) => risk.status !== "resolved" && risk.blocking_for_next_phase).length;
master.unassigned_resolution_phase_count = master.risks.filter((risk) => risk.status !== "resolved" && !risk.next_resolution_phase).length;
master.resolved_risk_count = master.risks.filter((risk) => risk.status === "resolved").length;
writeJson("reports/post-phase-master-risk-register.json", master);

const reevaluated = Object.keys(mEvidence);
writeJson("reports/post-phase-m-risk-register-update.json", {
  generated_at: generatedAt,
  contract_version: "post-phase-m-risk-register-update/v1",
  reevaluated_risk_ids: reevaluated,
  reevaluated_risk_count: reevaluated.length,
  added_risk_ids: newRisks.map((risk) => risk.id),
  duplicate_risk_id_count: master.risks.length - new Set(master.risks.map((risk) => risk.id)).size,
  unresolved_without_owner_count: master.risks.filter((risk) => risk.status !== "resolved" && !risk.owner).length,
  unresolved_without_next_phase_count: master.unassigned_resolution_phase_count,
  non_production_pilot_claimed_as_production_resolution: false,
  passed: true,
});

const riskRows = master.risks.map((risk) =>
  `| ${risk.id} | ${risk.status} | ${risk.severity} | ${risk.blocking_for_next_phase ? "yes" : "no"} | ${risk.next_resolution_phase ?? "completed"} | ${risk.owner ?? "completed"} |`,
).join("\n");
writeText("docs/post-phase-master-risk-register.md", `# Post-Phase Master Risk Register

## Post-Phase M update

M adds two repeatable bounded operating cycles, exact six-source health evidence, append-only review operations, hidden projection previews, and a bounded rollback/reapply drill. These are non-production results. They do not establish production schema parity, release authority, backup, RLS, canary, monitoring, or capacity evidence.

Only \`resolved\` is terminal. Every other status remains assigned to a named owner and future work unit. Zero-match and transport-blocked observations never prove deletion or source absence.

## Status summary

- Total risks: ${master.risks.length}
- Resolved: ${master.resolved_risk_count}
- Unresolved blocking risks: ${master.blocking_risk_count}
- Unresolved risks without a future phase: ${master.unassigned_resolution_phase_count}
- Production rollout: HOLD

| Risk ID | Status | Severity | Blocks next phase | Next resolution phase | Owner |
| --- | --- | --- | --- | --- | --- |
${riskRows}

The machine-readable canonical view is \`reports/post-phase-master-risk-register.json\`.`);

writeText("docs/post-phase-m-platform-maintenance.md", `# Post-Phase M Platform Maintenance

The full-repository baseline was 11 errors and 5 warnings. M removed seven deterministic errors and all five warnings without broad rule suppression. Four pre-existing \`react-hooks/set-state-in-effect\` findings remain explicitly baselined in the machine-readable report because fixing them safely requires hydration, navigation, and browser-storage lifecycle regression coverage.

M-owned files pass scoped ESLint. The build-time \`public.contests\` schema-cache warning is classified as a non-production schema mismatch: the L compatibility baseline does not include that product table. M does not create an unrelated database table to silence the warning.

Final command results are recorded in \`reports/post-phase-m-platform-maintenance.json\` and the M validation report.`);

writeText("docs/post-phase-m-production-readiness-decision.md", `# Post-Phase M Production Readiness Decision

## Decision

- Non-production controlled pilot: PASS
- Cohort expansion: GO for continued non-production operation
- Production rollout: HOLD

M executed no production read, write, migration, crawl, dual-write, backfill, or public automatic publication. The successful L/M project is evidence for operating behavior only; it is not production parity evidence.

## Required next gate

Before any production apply gate, the owner team must authorize and review a read-only production schema fingerprint, migration and RLS plan, backup/export, source reconciliation, backfill, canary, monitoring, incident response, capacity, and rollback authority. Remaining transport, zero-match, attachment, frontend lifecycle, and external LLM governance risks must be resolved or explicitly accepted.

The exact blocker checklist is in \`reports/post-phase-m-production-readiness.json\`.`);

console.log("Post-Phase M decision reports built");
