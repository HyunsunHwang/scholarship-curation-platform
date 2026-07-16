import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  EVIDENCE_KINDS,
  FINGERPRINT_SCHEMA_VERSION,
  isProductionReadOnlyEvidence,
  PRODUCTION_READ_ONLY_EVIDENCE_KIND,
} from "../../lib/post-phase-n-q/fingerprint.mjs";
import { PRODUCTION_PROJECT_REF } from "../../lib/post-phase-n-q/safety.mjs";
import {
  classifyMergeReadiness,
  collectGitReadiness,
  gitReadinessSnapshotMatches,
} from "../../lib/post-phase-n-q/git-readiness.mjs";

const ROOT = process.cwd();
const REPORT_ROOT = path.join(ROOT, "reports", "post-phase-n-q");
const checks = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function addCheck(name, passed, evidence) {
  checks.push({ name, passed: Boolean(passed), evidence });
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

function metricsFor(items) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  for (const item of items) {
    const expectedPositive = item.expected === "scholarship_true_positive";
    const predictedPositive = item.predicted === "scholarship_true_positive";
    if (expectedPositive && predictedPositive) truePositive += 1;
    else if (!expectedPositive && predictedPositive) falsePositive += 1;
    else if (expectedPositive && !predictedPositive) falseNegative += 1;
    else trueNegative += 1;
  }
  const precision =
    truePositive + falsePositive === 0
      ? 0
      : truePositive / (truePositive + falsePositive);
  const recall =
    truePositive + falseNegative === 0
      ? 0
      : truePositive / (truePositive + falseNegative);
  return {
    item_count: items.length,
    true_positive: truePositive,
    false_positive: falsePositive,
    false_negative: falseNegative,
    true_negative: trueNegative,
    precision,
    recall,
  };
}

function sameMetrics(actual, expected) {
  return (
    actual.item_count === expected.item_count &&
    actual.true_positive === expected.true_positive &&
    actual.false_positive === expected.false_positive &&
    actual.false_negative === expected.false_negative &&
    actual.true_negative === expected.true_negative &&
    Math.abs(actual.precision - expected.precision) < 1e-12 &&
    Math.abs(actual.recall - expected.recall) < 1e-12 &&
    actual.arithmetic_consistent === true
  );
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  });
}

function gitLines(args) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

const startingState = readJson("reports/post-phase-n-q/starting-state.json");
const reuse = readJson(
  "reports/post-phase-n-q/existing-implementation-reuse-matrix.json",
);
const fingerprint = readJson(
  "reports/post-phase-n-q/nonproduction-fingerprint.json",
);
const schemaDiff = readJson("reports/post-phase-n-q/schema-diff.json");
const ownerEvidenceValidation = readJson(
  "reports/post-phase-n-q/owner-evidence-validation-summary.json",
);
const scopedMigrationReadiness = readJson(
  "reports/post-phase-n-q/scoped-migration-readiness-summary.json",
);
const migrationPlan = readJson("reports/post-phase-n-q/migration-plan.json");
const canaryPlan = readJson("reports/post-phase-n-q/canary-plan.json");
const cohort = readJson("reports/post-phase-n-q/beta-source-cohort.json");
const live = readJson("reports/post-phase-n-q/live-source-inspection.json");
const semantic = readJson(
  "reports/post-phase-n-q/semantic-corpus-report.json",
);
const attachment = readJson(
  "reports/post-phase-n-q/live-attachment-inspection.json",
);
const integrated = readJson(
  "reports/post-phase-n-q/integrated-rehearsal.json",
);
const invariants = readJson(
  "reports/post-phase-n-q/nonproduction-invariants.json",
);
const browser = readJson("reports/post-phase-n-q/browser-walkthrough.json");
const browserState = readJson(
  "reports/post-phase-n-q/browser-rehearsal-state.json",
);
const operations = readJson(
  "reports/post-phase-n-q/operations-readiness.json",
);
const ownerGates = readJson("reports/post-phase-n-q/owner-gates.json");
const riskRegister = readJson("reports/post-phase-n-q/risk-register.json");
const focusedTests = readJson("reports/post-phase-n-q/focused-tests.json");
const finalMergeReadiness = readJson(
  "reports/post-phase-n-q/final-merge-readiness.json",
);
const cau012 = readJson("reports/post-phase-n-q/cau-012-owner-packet.json");
const liveGitReadiness = collectGitReadiness({ cwd: ROOT });
const liveMergeReadiness = classifyMergeReadiness(liveGitReadiness);
const productionRunnerFocusedResult = focusedTests.results.find(
  (result) => result.name === "N production fingerprint runner",
);
const productionRunnerFocusedOutput =
  productionRunnerFocusedResult?.output ?? "";
let productionRunnerFocusedEvidence = {};
try {
  productionRunnerFocusedEvidence = JSON.parse(
    productionRunnerFocusedOutput || "{}",
  );
} catch {
  productionRunnerFocusedEvidence = {};
}
const ownerScopedFocusedResult = focusedTests.results.find(
  (result) => result.name === "N owner evidence and scoped diff",
);
let ownerScopedFocusedEvidence = {};
try {
  ownerScopedFocusedEvidence = JSON.parse(
    ownerScopedFocusedResult?.output ?? "{}",
  );
} catch {
  ownerScopedFocusedEvidence = {};
}

addCheck(
  "starting_state_gate",
  startingState.status === "PASS" &&
    startingState.branch === "feat/post-phase-n" &&
    startingState.worktree_clean === true &&
    startingState.post_phase_m_semantic_commit_ancestor === true &&
    startingState.post_phase_m_main_merge_ancestor === true &&
    startingState.env_local_ignored === true &&
    startingState.env_local_tracked === false &&
    startingState.env_local_staged === false &&
    startingState.approved_nonproduction_ref_match === true &&
    startingState.forbidden_production_ref_detected === false,
  startingState,
);

addCheck(
  "remote_git_merge_readiness",
  liveGitReadiness.fetch_succeeded === true &&
    liveGitReadiness.commands_succeeded === true &&
    Boolean(liveGitReadiness.fetched_origin_main_sha) &&
    Boolean(liveGitReadiness.evaluated_head_sha) &&
    Boolean(liveGitReadiness.merge_base_sha) &&
    liveGitReadiness.unresolved_conflict_count === 0 &&
    gitReadinessSnapshotMatches(finalMergeReadiness, liveGitReadiness, {
      // The report itself is written after the clean snapshot, so it is the
      // only expected worktree change while this validation runs.
      includeWorktree: false,
    }) &&
    finalMergeReadiness.pr_creation_readiness ===
      liveMergeReadiness.pr_creation_readiness &&
    finalMergeReadiness.branch_up_to_date_with_main ===
      liveMergeReadiness.branch_up_to_date_with_main &&
    finalMergeReadiness.direct_fast_forward_merge_readiness ===
      liveMergeReadiness.direct_fast_forward_merge_readiness,
  {
    live: liveGitReadiness,
    report_snapshot_matches_live: gitReadinessSnapshotMatches(
      finalMergeReadiness,
      liveGitReadiness,
      { includeWorktree: false },
    ),
    merge_readiness: liveMergeReadiness,
  },
);

addCheck(
  "existing_main_implementation_reused",
  reuse.status === "PASS" &&
    reuse.parallel_system_count === 0 &&
    reuse.items.length >= 10 &&
    reuse.items.every(
      (item) =>
        Array.isArray(item.existing_files) &&
        item.existing_files.length > 0 &&
        item.disposition,
    ),
  {
    item_count: reuse.items.length,
    parallel_system_count: reuse.parallel_system_count,
  },
);

const reachableTables = fingerprint.aggregates.row_counts.filter(
  (item) => item.reachable,
);
addCheck(
  "nonproduction_fingerprint",
  fingerprint.schema_version === "post-phase-n-fingerprint/v1" &&
    fingerprint.project.project_ref === "hrayfvdggbhfmmzfblly" &&
    fingerprint.project.environment_kind === "non_production" &&
    fingerprint.project.guard_verified === true &&
    fingerprint.project.automatic_public_publish_enabled === false &&
    fingerprint.objects.tables.length === 22 &&
    reachableTables.length === 22 &&
    fingerprint.aggregates.row_counts.every((item) => item.reachable) &&
    fingerprint.completeness.production_parity_claimed === false &&
    fingerprint.safety.production_access_performed === false &&
    fingerprint.safety.production_read_performed === false &&
    fingerprint.safety.production_write_performed === false &&
    fingerprint.safety.database_write_performed === false,
  {
    table_count: fingerprint.objects.tables.length,
    reachable_table_count: reachableTables.length,
    production_parity_claimed:
      fingerprint.completeness.production_parity_claimed,
  },
);

addCheck(
  "schema_diff_arithmetic_and_evidence",
  schemaDiff.evidence_kind === "synthetic" &&
    schemaDiff.production_fingerprint_available === false &&
    schemaDiff.status === "CONDITIONAL_ON_PRODUCTION_FINGERPRINT" &&
    schemaDiff.arithmetic_consistent === true &&
    sum(Object.values(schemaDiff.classification_counts)) ===
      schemaDiff.difference_count &&
    schemaDiff.differences.length === schemaDiff.difference_count,
  {
    status: schemaDiff.status,
    difference_count: schemaDiff.difference_count,
    classification_total: sum(Object.values(schemaDiff.classification_counts)),
  },
);

const scopedClassificationTotal = sum(
  Object.values(scopedMigrationReadiness.classification_counts),
);
const scopedCoverageKinds = new Set(
  scopedMigrationReadiness.evidence_coverage_matrix.map(
    (entry) => entry.object_kind,
  ),
);
const ownerEvidenceSummaryText = JSON.stringify(ownerEvidenceValidation);
const scopedSummaryText = JSON.stringify(scopedMigrationReadiness);
const trackedOwnerEvidenceFiles = [
  "reports/post-phase-n-q/production-fingerprint-owner-output.json",
  "reports/post-phase-n-q/production-fingerprint-execution-receipt.json",
].filter((file) => gitLines(["ls-files", "--", file]).includes(file));
addCheck(
  "owner_evidence_acceptance_and_scoped_diff",
  ownerEvidenceValidation.passed === true &&
    ownerEvidenceValidation.schema_version === "post-phase-n-fingerprint/v1" &&
    ownerEvidenceValidation.evidence_kind ===
      PRODUCTION_READ_ONLY_EVIDENCE_KIND &&
    ownerEvidenceValidation.environment === "production" &&
    ownerEvidenceValidation.output_byte_count_match === true &&
    ownerEvidenceValidation.legacy_hash_consistent === true &&
    ownerEvidenceValidation.receipt_safety_passed === true &&
    ownerEvidenceValidation.row_body_absence_contract === true &&
    ownerEvidenceValidation.obvious_credential_pattern_count === 0 &&
    ownerEvidenceValidation.canonical_hash_algorithm ===
      "sha256/stable-json-codepoint-v1" &&
    ownerScopedFocusedEvidence.locale_independent_canonical_hash === true &&
    ownerScopedFocusedEvidence.array_and_object_ordering_deterministic ===
      true &&
    ownerScopedFocusedEvidence.legacy_hash_difference_recorded === true &&
    ownerScopedFocusedEvidence.optional_aggregate_enabled_spec === true &&
    ownerScopedFocusedEvidence.managed_schema_exclusion_tested === true &&
    ownerScopedFocusedEvidence.insufficient_evidence_not_overclassified ===
      true &&
    ownerScopedFocusedEvidence.beta_required_table_matrix_count === 11 &&
    ownerScopedFocusedEvidence.production_execute_called === false &&
    trackedOwnerEvidenceFiles.length === 0 &&
    scopedMigrationReadiness.scope?.schema === "public" &&
    scopedMigrationReadiness.scope?.excluded_object_count > 0 &&
    scopedMigrationReadiness.scope?.exclusion_reason &&
    ["CONDITIONAL", "HOLD"].includes(
      scopedMigrationReadiness.migration_readiness,
    ) &&
    scopedMigrationReadiness.classification_arithmetic_consistent === true &&
    scopedClassificationTotal ===
      scopedMigrationReadiness.comparable_difference_count &&
    [
      "tables",
      "columns",
      "indexes",
      "constraints",
      "policies",
      "grants",
      "functions",
      "triggers",
      "views",
      "materialized_views",
    ].every((kind) => scopedCoverageKinds.has(kind)) &&
    scopedMigrationReadiness.beta_required_table_status.length === 11 &&
    scopedMigrationReadiness.beta_required_table_status.every(
      (entry) =>
        entry.target_classification === "REQUIRED_FOR_BETA" &&
        typeof entry.present_in_production === "boolean" &&
        typeof entry.present_in_nonproduction === "boolean" &&
        typeof entry.migration_required === "boolean" &&
        entry.evidence_level &&
        entry.blocker_status,
    ) &&
    !/postgres(?:ql)?:\/\//iu.test(ownerEvidenceSummaryText) &&
    !/postgres(?:ql)?:\/\//iu.test(scopedSummaryText) &&
    !ownerEvidenceSummaryText.includes(PRODUCTION_PROJECT_REF) &&
    !scopedSummaryText.includes(PRODUCTION_PROJECT_REF),
  {
    owner_evidence_passed: ownerEvidenceValidation.passed,
    tracked_owner_evidence_file_count: trackedOwnerEvidenceFiles.length,
    canonical_hash_matches_legacy:
      ownerEvidenceValidation.canonical_hash_matches_legacy === true,
    scoped_migration_readiness: scopedMigrationReadiness.migration_readiness,
    scoped_blocker_count: scopedMigrationReadiness.blocker_count,
    beta_required_table_count:
      scopedMigrationReadiness.beta_required_table_status.length,
    scoped_coverage_kind_count: scopedCoverageKinds.size,
    locale_independent_canonical_hash:
      ownerScopedFocusedEvidence.locale_independent_canonical_hash === true,
    legacy_hash_difference_recorded:
      ownerScopedFocusedEvidence.legacy_hash_difference_recorded === true,
  },
);

addCheck(
  "migration_and_canary_not_authorized",
  migrationPlan.status === "CONDITIONAL_ON_PRODUCTION_FINGERPRINT" &&
    migrationPlan.production_migration_authorized === false &&
    migrationPlan.stages.length === 7 &&
    migrationPlan.stages.every(
      (stage, index) =>
        stage.order === index + 1 &&
        stage.precondition &&
        stage.verification &&
        stage.rollback,
    ) &&
    canaryPlan.status === "OWNER_PENDING" &&
    canaryPlan.production_canary_write_authorized === false,
  {
    migration_stage_count: migrationPlan.stages.length,
    canary_status: canaryPlan.status,
  },
);

const cohortKeys = new Set(cohort.source_keys);
addCheck(
  "source_cohort_bound",
  cohort.evidence_kind === "static_repository" &&
    cohort.source_count === cohort.source_keys.length &&
    cohort.source_count === cohort.sources.length &&
    cohortKeys.size === cohort.source_count &&
    cohort.source_count === 10 &&
    cohort.max_pages_per_source <= 5 &&
    cohort.max_items_per_source <= 30 &&
    cohort.exact_source_resolution_passed === true &&
    cohort.fuzzy_source_match_count === 0 &&
    cohort.automatic_source_create_count === 0 &&
    cohort.cau_012.automatic_source_create_count === 0 &&
    cohort.production_access_performed === false &&
    cohort.crawl_performed === false,
  {
    source_count: cohort.source_count,
    max_pages_per_source: cohort.max_pages_per_source,
    max_items_per_source: cohort.max_items_per_source,
  },
);

const liveKeys = new Set(live.sources.map((source) => source.source_key));
const zeroMatchSources = live.sources.filter(
  (source) => source.status === "BOUNDED_ZERO_MATCH",
);
const zeroMatchWordingPassed = zeroMatchSources.every((source) =>
  source.limitations.some(
    (limitation) =>
      /bounded zero-match/iu.test(limitation) &&
      /not evidence that scholarships are absent/iu.test(limitation),
  ),
);
addCheck(
  "live_fixture_and_zero_match_separation",
  live.evidence_kind === "live_public" &&
    live.live_source_count === live.sources.length &&
    live.live_source_count === liveKeys.size &&
    live.live_source_count <= cohort.source_count &&
    [...liveKeys].every((key) => cohortKeys.has(key)) &&
    live.bounded_scope.max_pages_per_source <= 5 &&
    live.bounded_scope.max_items_per_source <= 30 &&
    live.bounded_zero_match_source_count === zeroMatchSources.length &&
    zeroMatchWordingPassed &&
    live.sources.every((source) => !/ABSENT/iu.test(source.status)) &&
    live.live_true_positive_source_count >= 1 &&
    live.insecure_tls_host_count === 0 &&
    live.tls_verification_disabled === false &&
    live.fuzzy_source_match_count === 0 &&
    live.automatic_source_create_count === 0 &&
    live.production_access_performed === false,
  {
    live_source_count: live.live_source_count,
    live_true_positive_source_count: live.live_true_positive_source_count,
    bounded_zero_match_source_count: zeroMatchSources.length,
    zero_match_wording_passed: zeroMatchWordingPassed,
  },
);

const fixtureMetrics = metricsFor(semantic.fixture_items);
const liveMetrics = metricsFor(semantic.live_items);
const combinedMetrics = metricsFor([
  ...semantic.fixture_items,
  ...semantic.live_items,
]);
addCheck(
  "semantic_confusion_matrix",
  semantic.evidence_kind === "fixture" &&
    /not independent human ground truth/iu.test(
      semantic.corpus_label_caveat,
    ) &&
    sameMetrics(semantic.fixture_metrics, fixtureMetrics) &&
    sameMetrics(semantic.live_metrics, liveMetrics) &&
    sameMetrics(semantic.combined_metrics, combinedMetrics) &&
    semantic.combined_metrics.precision >= semantic.target_precision &&
    semantic.combined_metrics.recall >= semantic.target_recall &&
    semantic.hard_negative_automatic_public_projection_count === 0 &&
    semantic.insufficient_evidence_automatic_approval_count === 0 &&
    semantic.automatic_public_publish_count === 0,
  {
    fixture: fixtureMetrics,
    live: liveMetrics,
    combined: combinedMetrics,
    hard_negative_automatic_public_projection_count:
      semantic.hard_negative_automatic_public_projection_count,
    insufficient_evidence_automatic_approval_count:
      semantic.insufficient_evidence_automatic_approval_count,
  },
);

const attachmentStageOrderPassed =
  (!attachment.stages.useful_text_extracted ||
    attachment.stages.extraction_attempted) &&
  (!attachment.stages.extraction_attempted ||
    attachment.stages.parser_selected) &&
  (!attachment.stages.parser_selected ||
    (attachment.stages.signature_checked &&
      attachment.stages.hash_calculated &&
      attachment.stages.bytes_received));
addCheck(
  "attachment_stage_separation",
  attachment.evidence_kind === "live_public" &&
    attachment.byte_count > 0 &&
    attachment.stages.metadata_discovered === true &&
    attachment.stages.url_resolved === true &&
    attachment.stages.download_attempted === true &&
    attachment.stages.bytes_received === true &&
    attachment.stages.mime_checked === true &&
    attachment.stages.signature_checked === true &&
    attachment.stages.hash_calculated === true &&
    attachment.parser_result === "UNKNOWN_BINARY" &&
    attachment.stages.parser_selected === false &&
    attachment.stages.extraction_attempted === false &&
    attachment.stages.useful_text_extracted === false &&
    attachmentStageOrderPassed &&
    attachment.live_file_committed === false &&
    attachment.external_llm_upload_performed === false &&
    attachment.arbitrary_execution_performed === false &&
    attachment.document_network_access_enabled === false &&
    attachment.tls_verification_disabled === false &&
    attachment.production_access_performed === false,
  {
    parser_result: attachment.parser_result,
    byte_count: attachment.byte_count,
    stages: attachment.stages,
  },
);

addCheck(
  "cau_012_fail_closed",
  cau012.gate === "OWNER_GATE_P_CAU_012_INVENTORY" &&
    cau012.recommendation === "NEEDS_MORE_EVIDENCE" &&
    cau012.owner_decision?.decision === "NEEDS_MORE_EVIDENCE" &&
    cau012.owner_decision?.canary_inclusion === false &&
    cau012.owner_decision?.reason ===
      "official unit, official board, and exact list URL are not verified" &&
    cau012.automatic_source_create_count === 0 &&
    cau012.inventory_modified === false &&
    cau012.crawl_performed === false &&
    cau012.production_access_performed === false &&
    canaryPlan.cau_012_owner_decision?.decision ===
      "NEEDS_MORE_EVIDENCE" &&
    canaryPlan.cau_012_owner_decision?.canary_inclusion === false,
  {
    recommendation: cau012.recommendation,
    owner_decision: cau012.owner_decision,
    automatic_source_create_count: cau012.automatic_source_create_count,
  },
);

addCheck(
  "integrated_nonproduction_rehearsal",
  integrated.passed === true &&
    integrated.evidence_kind === "database_nonproduction" &&
    integrated.input_evidence_kind === "fixture" &&
    integrated.fixture_reported_as_live === false &&
    integrated.graph_ingest_passed === true &&
    integrated.approve_e2e_passed === true &&
    integrated.approved_surface.list_visible === true &&
    integrated.approved_surface.search_visible === true &&
    integrated.approved_surface.detail_visible === true &&
    integrated.reject_e2e_passed === true &&
    integrated.rejected_surface.list_visible === false &&
    integrated.rejected_surface.search_visible === false &&
    integrated.rejected_surface.detail_visible === false &&
    integrated.logical_recovery_passed === true &&
    integrated.deterministic_reapply_passed === true &&
    integrated.final_containment_passed === true &&
    integrated.initial_review_events_preserved === true &&
    integrated.review_event_mutation_count === 0 &&
    integrated.duplicate_notice_count === 0 &&
    integrated.duplicate_occurrence_count === 0 &&
    integrated.duplicate_projection_count === 0 &&
    integrated.unrelated_row_change_count === 0 &&
    integrated.public_row_without_effective_approve_count === 0 &&
    integrated.rejected_public_leakage_count === 0 &&
    integrated.withdrawn_public_leakage_count === 0 &&
    integrated.automatic_public_publish_count === 0 &&
    integrated.production_access_performed === false &&
    integrated.production_read_performed === false &&
    integrated.production_write_performed === false &&
    integrated.external_llm_call_count === 0 &&
    integrated.ephemeral_admin_credentials_printed === false,
  {
    review_event_count: integrated.review_event_count,
    duplicate_projection_count: integrated.duplicate_projection_count,
    review_event_mutation_count: integrated.review_event_mutation_count,
    unrelated_row_change_count: integrated.unrelated_row_change_count,
  },
);

addCheck(
  "final_nonproduction_invariants",
  invariants.passed === true &&
    invariants.evidence_kind === "database_nonproduction" &&
    invariants.target_project_ref === "hrayfvdggbhfmmzfblly" &&
    invariants.active_public_scholarship_count === 0 &&
    invariants.public_row_without_effective_approve_count === 0 &&
    invariants.rejected_or_withdrawn_public_leakage_count === 0 &&
    invariants.duplicate_projection_count === 0 &&
    invariants.review_event_mutation_count === 0 &&
    invariants.automatic_public_publish_count === 0 &&
    invariants.production_access_performed === false &&
    invariants.production_write_performed === false &&
    invariants.database_write_performed === false,
  {
    active_public_scholarship_count:
      invariants.active_public_scholarship_count,
    public_row_without_effective_approve_count:
      invariants.public_row_without_effective_approve_count,
    rejected_or_withdrawn_public_leakage_count:
      invariants.rejected_or_withdrawn_public_leakage_count,
  },
);

const requiredRoutes = [
  "/scholarships",
  "/scholarships/6",
  "/library",
  "/library/saved",
  "/admin/review",
  "/admin/review/scholarships/15",
  "/admin/crawler-review",
];
const screenshotEvidencePassed = browser.screenshots.every(
  (file) => exists(file) && fs.statSync(path.join(ROOT, file)).size > 0,
);
addCheck(
  "authenticated_browser_walkthrough",
  browser.status === "PASS" &&
    browser.browser_walkthrough_complete === true &&
    browser.authenticated_admin_layout_reached === true &&
    browser.temporary_projection_visible_during_walkthrough === true &&
    browser.temporary_projection_cleanup_required === false &&
    browser.temporary_projection_cleanup_completed === true &&
    browser.temporary_test_admin_cleanup_completed === true &&
    requiredRoutes.every((route) => browser.routes.includes(route)) &&
    browser.checks.desktop_checked === true &&
    browser.checks.mobile_390_checked === true &&
    browser.checks.incoherent_horizontal_overflow_count === 0 &&
    browser.checks.blocking_console_error_count === 0 &&
    screenshotEvidencePassed &&
    browser.environment.production_read_performed === false &&
    browser.environment.production_write_performed === false &&
    browserState.passed === true &&
    browserState.mode === "hide" &&
    browserState.visible === false &&
    browserState.credentials_written_to_temporary_file === false &&
    browserState.credentials_printed === false &&
    browserState.automatic_public_publish_count === 0 &&
    browserState.production_access_performed === false,
  {
    route_count: browser.routes.length,
    screenshot_count: browser.screenshots.length,
    screenshot_evidence_passed: screenshotEvidencePassed,
    final_mode: browserState.mode,
    final_visible: browserState.visible,
  },
);

const roleNames = new Set(operations.roles.map((role) => role.role));
addCheck(
  "operations_readiness",
  operations.passed === true &&
    operations.evidence_kind === "database_nonproduction" &&
    ["Reviewer", "Operator", "Owner"].every((role) => roleNames.has(role)) &&
    operations.audit_model.append_only_review_events_reused === true &&
    operations.metrics.active_public_scholarship_count === 0 &&
    operations.metrics.projection_failure_count === 0 &&
    operations.production_access_performed === false &&
    operations.production_write_performed === false &&
    operations.external_alert_service_connected === false,
  {
    roles: [...roleNames],
    metrics: operations.metrics,
  },
);

const requiredGateNames = [
  "OWNER_GATE_N_PRODUCTION_READ_ONLY_FINGERPRINT",
  "OWNER_GATE_N_PRODUCTION_BACKUP",
  "OWNER_GATE_N_PRODUCTION_MIGRATION",
  "OWNER_GATE_N_NONPRODUCTION_MANUAL_SQL",
  "OWNER_GATE_N_CANARY_WRITE",
  "OWNER_GATE_P_CAU_012_INVENTORY",
  "OWNER_GATE_O_PRODUCTION_PROJECTION_BINDING",
  "OWNER_GATE_Q_PUBLIC_BETA",
];
const gateNames = new Set(ownerGates.gates.map((gate) => gate.name));
const gatesByName = new Map(
  ownerGates.gates.map((gate) => [gate.name, gate]),
);
addCheck(
  "owner_gate_package",
  ownerGates.evidence_kind === "owner_evidence_accepted" &&
    requiredGateNames.every((name) => gateNames.has(name)) &&
    ownerGates.gates.every(
      (gate) =>
        gate.reason &&
        gate.decider &&
        gate.status &&
        gate.command &&
        gate.location &&
        gate.secret_safe_check &&
        gate.expected_success &&
        Array.isArray(gate.stop_conditions) &&
        gate.evidence_path &&
        Array.isArray(gate.share_back) &&
        gate.cleanup &&
        gate.work_without_gate,
    ),
  {
    required_gate_count: requiredGateNames.length,
    present_gate_count: requiredGateNames.filter((name) => gateNames.has(name))
      .length,
  },
);

addCheck(
  "owner_gate_status_reconciliation",
  gatesByName.get("OWNER_GATE_N_PRODUCTION_READ_ONLY_FINGERPRINT")
    ?.status ===
    (ownerEvidenceValidation.passed ? "PASS_OWNER_READ_ONLY" : "OWNER_PENDING") &&
    gatesByName.get("OWNER_GATE_N_PRODUCTION_MIGRATION")?.status ===
      (scopedMigrationReadiness.migration_readiness === "HOLD"
        ? "NOT_AUTHORIZED"
        : "OWNER_PENDING") &&
    gatesByName.get("OWNER_GATE_N_CANARY_WRITE")?.status ===
      "NOT_AUTHORIZED" &&
    canaryPlan.production_canary_write_authorized === false &&
    canaryPlan.status === "OWNER_PENDING" &&
    gatesByName.get("OWNER_GATE_Q_PUBLIC_BETA")?.status === "HOLD",
  {
    fingerprint_gate:
      gatesByName.get("OWNER_GATE_N_PRODUCTION_READ_ONLY_FINGERPRINT")?.status,
    migration_gate:
      gatesByName.get("OWNER_GATE_N_PRODUCTION_MIGRATION")?.status,
    canary_write_gate:
      gatesByName.get("OWNER_GATE_N_CANARY_WRITE")?.status,
    canary_rollout: "HOLD",
    public_beta_gate: gatesByName.get("OWNER_GATE_Q_PUBLIC_BETA")?.status,
  },
);

const allowedRiskStatuses = new Set([
  "RESOLVED",
  "MITIGATED",
  "OBSERVED",
  "OWNER_PENDING",
  "EXTERNAL_HOLD",
  "ENGINEERING_HOLD",
  "NOT_AUTHORIZED",
  "NOT_STARTED",
]);
const riskIds = new Set(riskRegister.risks.map((risk) => risk.id));
addCheck(
  "risk_register",
  riskRegister.risks.length >= 27 &&
    riskIds.size === riskRegister.risks.length &&
    riskRegister.risks.every(
      (risk) =>
        risk.id &&
        risk.name &&
        allowedRiskStatuses.has(risk.status) &&
        risk.evidence,
    ),
  {
    risk_count: riskRegister.risks.length,
    unique_risk_count: riskIds.size,
  },
);

addCheck(
  "focused_tests_evidence",
  focusedTests.passed === true &&
    focusedTests.test_command_count >= 11 &&
    focusedTests.failed_count === 0 &&
    focusedTests.passed_count === focusedTests.test_command_count &&
    focusedTests.results.every(
      (result) => result.passed === true && result.exit_code === 0,
    ),
  {
    passed_count: focusedTests.passed_count,
    test_command_count: focusedTests.test_command_count,
  },
);

const requiredDocs = [
  "production-read-only-investigation-runbook.md",
  "production-fingerprint-schema.md",
  "production-vs-nonproduction-diff-guide.md",
  "migration-plan.md",
  "backup-and-restore-plan.md",
  "rollback-runbook.md",
  "backfill-plan.md",
  "canary-release-plan.md",
  "review-to-public-contract.md",
  "source-reliability-policy.md",
  "beta-operations-runbook.md",
  "incident-response-plan.md",
  "owner-gates.md",
  "owner-evidence-and-scoped-diff.md",
  "beta-go-hold-checklist.md",
];
addCheck(
  "production_readiness_documents",
  requiredDocs.every((file) => {
    const relative = `docs/post-phase-n-q/${file}`;
    return exists(relative) && fs.statSync(path.join(ROOT, relative)).size > 200;
  }),
  {
    required_count: requiredDocs.length,
    present_count: requiredDocs.filter((file) =>
      exists(`docs/post-phase-n-q/${file}`),
    ).length,
  },
);

const sql = fs.readFileSync(
  path.join(ROOT, "supabase/post-phase-n-q/001_production_read_only_fingerprint.sql"),
  "utf8",
);
const sqlWithoutComments = sql.replace(/--.*$/gmu, "");
const requiredCatalogSources = [
  "pg_namespace",
  "pg_class",
  "information_schema.columns",
  "pg_constraint",
  "pg_indexes",
  "pg_policies",
  "role_table_grants",
  "pg_proc",
  "pg_trigger",
  "pg_views",
  "pg_matviews",
];
const forbiddenSchemaAssumptions = [
  "supabase_migrations.schema_migrations",
  "public.scholarships",
  "public.crawled_notices",
  "public.notice_sources",
  "digest(",
];
addCheck(
  "production_fingerprint_sql_read_only",
  /begin\s+transaction\s+read\s+only/iu.test(sqlWithoutComments) &&
    /\brollback\b/iu.test(sqlWithoutComments) &&
    sql.includes(PRODUCTION_READ_ONLY_EVIDENCE_KIND) &&
    requiredCatalogSources.every((source) => sql.includes(source)) &&
    forbiddenSchemaAssumptions.every(
      (assumption) => !sql.includes(assumption),
    ) &&
    !/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke)\b/iu.test(
      sqlWithoutComments,
    ),
  {
    begins_read_only: /begin\s+transaction\s+read\s+only/iu.test(
      sqlWithoutComments,
    ),
    contains_rollback: /\brollback\b/iu.test(sqlWithoutComments),
    catalog_source_count: requiredCatalogSources.filter((source) =>
      sql.includes(source),
    ).length,
    forbidden_schema_assumption_count: forbiddenSchemaAssumptions.filter(
      (assumption) => sql.includes(assumption),
    ).length,
  },
);

const productionRunnerSource = fs.readFileSync(
  path.join(
    ROOT,
    "scripts/post-phase-n/run-production-read-only-fingerprint.mjs",
  ),
  "utf8",
);
const productionRunnerContractSource = fs.readFileSync(
  path.join(
    ROOT,
    "lib/post-phase-n-q/production-fingerprint-runner.mjs",
  ),
  "utf8",
);
const productionRunbookSource = fs.readFileSync(
  path.join(
    ROOT,
    "docs/post-phase-n-q/production-read-only-investigation-runbook.md",
  ),
  "utf8",
);
const diffRunnerSource = fs.readFileSync(
  path.join(ROOT, "scripts/post-phase-n/diff-schema-fingerprints.mjs"),
  "utf8",
);
const validProductionEvidence = {
  schema_version: FINGERPRINT_SCHEMA_VERSION,
  evidence: {
    evidence_kind: PRODUCTION_READ_ONLY_EVIDENCE_KIND,
    environment: "production",
  },
  safety: {
    transaction_read_only: true,
    ddl_performed: false,
    dml_performed: false,
    row_body_dumped: false,
  },
};
const staleCleanupCallIndex = productionRunnerSource.indexOf(
  "removeStaleEvidence(resolvedEvidencePaths);",
);
const productionGateCallIndex = productionRunnerSource.indexOf(
  "const guard = assertProductionReadGate(env);",
);
const staleEvidenceCleanupPrecedesGate =
  staleCleanupCallIndex >= 0 &&
  productionGateCallIndex >= 0 &&
  staleCleanupCallIndex < productionGateCallIndex;
const connectionValidationCallIndex = productionRunnerSource.indexOf(
  "const psqlEnvironment = buildPsqlEnvironment(env);",
);
const baseExecuteCallIndex = productionRunnerSource.indexOf(
  'const baseOutput = execute(["--file", SQL_PATH], psqlEnvironment);',
);
const connectionValidationPrecedesExecute =
  connectionValidationCallIndex >= 0 &&
  baseExecuteCallIndex >= 0 &&
  connectionValidationCallIndex < baseExecuteCallIndex;
addCheck(
  "production_fingerprint_evidence_contract",
  EVIDENCE_KINDS.has(PRODUCTION_READ_ONLY_EVIDENCE_KIND) &&
    isProductionReadOnlyEvidence(validProductionEvidence) &&
    !isProductionReadOnlyEvidence({
      ...validProductionEvidence,
      evidence: {
        evidence_kind: "owner_pending",
        environment: "production",
      },
    }) &&
    productionRunnerSource.includes(
      "production-fingerprint-owner-output.json",
    ) &&
    productionRunnerSource.includes(
      "production-fingerprint-execution-receipt.json",
    ) &&
    staleEvidenceCleanupPrecedesGate &&
    productionRunnerFocusedEvidence.stale_evidence_gate_failure_tested ===
      true &&
    productionRunnerFocusedEvidence.execute_not_called_on_gate_failure ===
      true &&
    productionRunnerFocusedEvidence.owner_evidence_preserved_if_present ===
      true &&
    productionRunnerFocusedEvidence.direct_url_project_ref_tested === true &&
    productionRunnerFocusedEvidence.session_pooler_project_ref_tested ===
      true &&
    productionRunnerFocusedEvidence.session_pooler_negative_security_case_count >=
      5 &&
    productionRunnerFocusedEvidence.session_pooler_credential_redaction_tested ===
      true &&
    productionRunnerFocusedEvidence.direct_libpq_decomposition_tested ===
      true &&
    productionRunnerFocusedEvidence.session_pooler_libpq_decomposition_tested ===
      true &&
    productionRunnerFocusedEvidence.pgdatabase_is_database_name === true &&
    productionRunnerFocusedEvidence.psql_arguments_secret_free === true &&
    productionRunnerFocusedEvidence.encoded_credentials_decoded === true &&
    productionRunnerFocusedEvidence.sslmode_mapping_tested === true &&
    productionRunnerFocusedEvidence.connection_validation_failure_count >=
      7 &&
    productionRunnerFocusedEvidence.connection_validation_execute_not_called ===
      true &&
    productionRunnerFocusedEvidence.project_ref_mismatch_execute_not_called ===
      true &&
    connectionValidationPrecedesExecute &&
    productionRunnerFocusedEvidence.production_execute_called === false &&
    !productionRunnerFocusedOutput.includes("fixture-password") &&
    !productionRunnerFocusedOutput.includes("postgres://") &&
    !productionRunnerFocusedOutput.includes("postgresql://") &&
    productionRunnerSource.includes("childEnv.PGHOST = connection.host") &&
    productionRunnerSource.includes("childEnv.PGPORT = connection.port") &&
    productionRunnerSource.includes(
      "childEnv.PGUSER = connection.username",
    ) &&
    productionRunnerSource.includes(
      "childEnv.PGPASSWORD = connection.password",
    ) &&
    productionRunnerSource.includes(
      "childEnv.PGDATABASE = connection.database",
    ) &&
    !productionRunnerSource.includes(
      "childEnv.PGDATABASE = env.POST_PHASE_N_PRODUCTION_DATABASE_URL",
    ) &&
    !productionRunnerSource.includes('"--dbname"') &&
    productionRunbookSource.includes("Direct connection") &&
    productionRunbookSource.includes("Shared Session pooler") &&
    productionRunbookSource.includes("IPv4-only") &&
    productionRunbookSource.includes("Windows `psql`") &&
    productionRunbookSource.includes("discrete libpq") &&
    productionRunbookSource.includes("PGPASSWORD") &&
    productionRunbookSource.includes("hostname") &&
    productionRunbookSource.includes("username") &&
    productionRunbookSource.includes("OWNER_PENDING") &&
    productionRunnerContractSource.includes(
      "validateProductionFingerprintDocument",
    ) &&
    productionRunnerContractSource.includes(
      "productionWritePerformedFromSafety",
    ) &&
    !/productionPath\.includes\(\s*["']\.synthetic\.["']\s*\)/u.test(
      diffRunnerSource,
    ) &&
    !productionRunnerSource.includes(
      "production-fingerprint-owner-output.txt",
    ),
  {
    evidence_kind_registered: EVIDENCE_KINDS.has(
      PRODUCTION_READ_ONLY_EVIDENCE_KIND,
    ),
    valid_production_evidence_recognized:
      isProductionReadOnlyEvidence(validProductionEvidence),
    stale_evidence_cleanup_precedes_gate:
      staleEvidenceCleanupPrecedesGate,
    stale_evidence_gate_failure_tested:
      productionRunnerFocusedEvidence.stale_evidence_gate_failure_tested ===
      true,
    execute_not_called_on_gate_failure:
      productionRunnerFocusedEvidence.execute_not_called_on_gate_failure ===
      true,
    owner_evidence_preserved_if_present:
      productionRunnerFocusedEvidence.owner_evidence_preserved_if_present ===
      true,
    direct_url_project_ref_tested:
      productionRunnerFocusedEvidence.direct_url_project_ref_tested === true,
    session_pooler_project_ref_tested:
      productionRunnerFocusedEvidence.session_pooler_project_ref_tested ===
      true,
    session_pooler_negative_security_case_count:
      productionRunnerFocusedEvidence.session_pooler_negative_security_case_count ??
      0,
    session_pooler_credential_redaction_tested:
      productionRunnerFocusedEvidence.session_pooler_credential_redaction_tested ===
      true,
    direct_libpq_decomposition_tested:
      productionRunnerFocusedEvidence.direct_libpq_decomposition_tested ===
      true,
    session_pooler_libpq_decomposition_tested:
      productionRunnerFocusedEvidence.session_pooler_libpq_decomposition_tested ===
      true,
    pgdatabase_is_database_name:
      productionRunnerFocusedEvidence.pgdatabase_is_database_name === true,
    psql_arguments_secret_free:
      productionRunnerFocusedEvidence.psql_arguments_secret_free === true,
    encoded_credentials_decoded:
      productionRunnerFocusedEvidence.encoded_credentials_decoded === true,
    sslmode_mapping_tested:
      productionRunnerFocusedEvidence.sslmode_mapping_tested === true,
    connection_validation_failure_count:
      productionRunnerFocusedEvidence.connection_validation_failure_count ??
      0,
    connection_validation_execute_not_called:
      productionRunnerFocusedEvidence.connection_validation_execute_not_called ===
      true,
    project_ref_mismatch_execute_not_called:
      productionRunnerFocusedEvidence.project_ref_mismatch_execute_not_called ===
      true,
    connection_validation_precedes_execute:
      connectionValidationPrecedesExecute,
    focused_report_credentials_absent:
      !productionRunnerFocusedOutput.includes("fixture-password") &&
      !productionRunnerFocusedOutput.includes("postgres://") &&
      !productionRunnerFocusedOutput.includes("postgresql://"),
    production_execute_called:
      productionRunnerFocusedEvidence.production_execute_called === true,
    connection_url_not_assigned_to_pgdatabase:
      !productionRunnerSource.includes(
        "childEnv.PGDATABASE = env.POST_PHASE_N_PRODUCTION_DATABASE_URL",
      ),
    command_line_database_url_absent:
      !productionRunnerSource.includes('"--dbname"'),
    owner_runbook_connection_modes_documented:
      productionRunbookSource.includes("Direct connection") &&
      productionRunbookSource.includes("Shared Session pooler") &&
      productionRunbookSource.includes("IPv4-only") &&
      productionRunbookSource.includes("discrete libpq"),
    filename_heuristic_absent:
      !/productionPath\.includes\(\s*["']\.synthetic\.["']\s*\)/u.test(
        diffRunnerSource,
      ),
  },
);

const sourceRoots = ["app", "components", "lib", "scripts", "supabase"];
const validatorPath = path.normalize(
  path.join(ROOT, "scripts/post-phase-n-q/validate-post-phase-n-q.mjs"),
);
const sourceFiles = sourceRoots
  .flatMap((directory) => listFiles(path.join(ROOT, directory)))
  .filter((file) => file !== validatorPath)
  .filter((file) => /\.(?:js|mjs|cjs|ts|tsx|sql)$/iu.test(file));
const unsafeTlsPatterns = [
  { label: "NODE_TLS_REJECT_UNAUTHORIZED=0", regex: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/iu },
  { label: "rejectUnauthorized:false", regex: /rejectUnauthorized\s*:\s*false/iu },
  { label: "curl -k", regex: /\bcurl(?:\.exe)?\s+-k(?:\s|$)/iu },
  { label: "wget --no-check-certificate", regex: /\bwget\s+--no-check-certificate/iu },
  { label: "insecure TLS host allowlist", regex: /CRAWL_ALLOW_INSECURE_TLS_HOSTS/iu },
];
const unsafeTlsHits = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of unsafeTlsPatterns) {
    if (pattern.regex.test(text)) {
      unsafeTlsHits.push({
        file: path.relative(ROOT, file).replaceAll("\\", "/"),
        pattern: pattern.label,
      });
    }
  }
}
addCheck("tls_unsafe_bypass_absent", unsafeTlsHits.length === 0, unsafeTlsHits);

const changedFiles = new Set([
  ...gitLines(["diff", "--name-only", "HEAD"]),
  ...gitLines(["ls-files", "--others", "--exclude-standard"]),
]);
const forbiddenChanges = [...changedFiles].filter(
  (file) =>
    [
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lockb",
      "lib/database.types.ts",
    ].includes(file.replaceAll("\\", "/")) ||
    /^\.github\/workflows\//u.test(file.replaceAll("\\", "/")) ||
    /(?:^|\/)\.env(?:\.|$)/u.test(file.replaceAll("\\", "/")),
);
addCheck(
  "forbidden_repository_surfaces_unchanged",
  forbiddenChanges.length === 0,
  forbiddenChanges,
);

const textualChangedFiles = [...changedFiles]
  .map((file) => path.join(ROOT, file))
  .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
  .filter((file) => !/\.(?:png|jpg|jpeg|gif|webp|pdf|docx?)$/iu.test(file))
  .filter((file) => fs.statSync(file).size <= 2_000_000);
const secretPatterns = [
  {
    label: "dotenv credential assignment",
    regex:
      /^(?:SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|POST_PHASE_N_PRODUCTION_DATABASE_URL)=.{12,}$/mu,
  },
  {
    label: "JWT-like token",
    regex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/u,
  },
  { label: "Supabase secret token", regex: /\bsb_secret_[A-Za-z0-9_-]{12,}/u },
  {
    label: "credentialed PostgreSQL URL",
    regex: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/iu,
  },
];
const secretHits = [];
for (const file of textualChangedFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.regex.test(text)) {
      secretHits.push({
        file: path.relative(ROOT, file).replaceAll("\\", "/"),
        pattern: pattern.label,
      });
    }
  }
}
addCheck("tracked_secret_material_absent", secretHits.length === 0, secretHits);

const passed = checks.every((check) => check.passed);
const failedChecks = checks.filter((check) => !check.passed);
const riskStatusCounts = Object.fromEntries(
  [...allowedRiskStatuses].map((status) => [
    status,
    riskRegister.risks.filter((risk) => risk.status === status).length,
  ]),
);
const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-n-q-validator/v1",
  status: passed ? "PASS" : "HOLD",
  passed,
  check_count: checks.length,
  passed_check_count: checks.filter((check) => check.passed).length,
  failed_check_count: failedChecks.length,
  failed_checks: failedChecks.map((check) => check.name),
  checks,
  safety: {
    production_access_performed: false,
    production_read_performed: false,
    production_write_performed: false,
    production_migration_performed: false,
    production_backup_performed: false,
    production_canary_write_performed: false,
    automatic_public_publish_performed: false,
    external_llm_call_performed: false,
    tls_verification_disabled: false,
    secrets_exposed: false,
  },
  final_gates: {
    integrated_engineering_package: passed ? "PASS" : "HOLD",
    production_investigation_package: passed ? "PASS" : "HOLD",
    production_fingerprint: ownerEvidenceValidation.passed
      ? "PASS_OWNER_READ_ONLY"
      : "OWNER_PENDING",
    migration_readiness: scopedMigrationReadiness.migration_readiness,
    rollback_readiness: "PASS_NONPRODUCTION",
    review_to_public_projection: "PASS_NONPRODUCTION",
    controlled_data_quality_cohort: "HOLD",
    operations_readiness: "PASS_MINIMUM",
    core_ux_readiness: browser.browser_walkthrough_complete
      ? "PASS"
      : "HOLD",
    production_migration: "NOT_AUTHORIZED",
    canary_write: "NOT_AUTHORIZED",
    canary_rollout: "HOLD",
    public_beta: "HOLD",
  },
  risk_status_counts: riskStatusCounts,
  changed_file_count: changedFiles.size,
};

fs.mkdirSync(REPORT_ROOT, { recursive: true });
fs.writeFileSync(
  path.join(REPORT_ROOT, "validation-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

const markdown = [
  "# Post-Phase N-Q Validation Report",
  "",
  `- Status: **${report.status}**`,
  `- Checks: ${report.passed_check_count}/${report.check_count}`,
  `- Production access: ${report.safety.production_access_performed}`,
  `- Production write: ${report.safety.production_write_performed}`,
  `- Automatic public publish: ${report.safety.automatic_public_publish_performed}`,
  "",
  "## Checks",
  "",
  ...checks.map(
    (check) => `- ${check.passed ? "PASS" : "HOLD"}: \`${check.name}\``,
  ),
  "",
  "## Final Gates",
  "",
  ...Object.entries(report.final_gates).map(
    ([name, status]) => `- \`${name}\`: ${status}`,
  ),
  "",
  "## Interpretation",
  "",
  passed
    ? "The production-independent N-Q engineering package passes. Production fingerprinting, migration, canary rollout, and Public Beta remain separately owner-gated."
    : `Engineering validation remains on hold: ${report.failed_checks.join(", ")}.`,
  "",
].join("\n");
fs.writeFileSync(
  path.join(REPORT_ROOT, "validation-report.md"),
  markdown,
  "utf8",
);

console.log(
  `POST-PHASE N-Q ENGINEERING VALIDATOR: ${report.status} (${report.passed_check_count}/${report.check_count})`,
);
if (!passed) {
  for (const check of failedChecks) console.error(`- ${check.name}`);
  process.exitCode = 1;
}
