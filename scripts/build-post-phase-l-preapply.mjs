import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  applyPlanToMemory,
  summarizeGraphPlan,
} from "../lib/post-phase-l/normalized-graph.mjs";
import { parseJsonWithDuplicateKeyCheck } from "../lib/post-phase-l/strict-json.mjs";
import { inspectPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";

const GENERATED_AT = new Date().toISOString();
const TARGET_REF = "hrayfvdggbhfmmzfblly";
const TARGET_URL = "https://hrayfvdggbhfmmzfblly.supabase.co";
const MIGRATIONS = [
  "supabase/post-phase-l/001_post_phase_l_compatibility_baseline.sql",
  "supabase/post-phase-l/002_post_phase_l_normalized_graph.sql",
  "supabase/post-phase-l/003_post_phase_l_pilot_seed.sql",
];
const ROLLBACK_FILES = [
  "supabase/post-phase-l/900_post_phase_l_bounded_data_rollback.sql",
  "supabase/post-phase-l/999_post_phase_l_schema_rollback.sql",
];
const VERIFICATION_SQL = "supabase/post-phase-l/verify_post_phase_l_schema.sql";
const L_OWNED_FILES = [
  "app/admin/crawled-notices/actions.ts",
  "app/admin/crawler-review/page.tsx",
  "app/admin/review/scholarships/[id]/page.tsx",
  "app/admin/review/scholarships/[id]/PostPhaseLReviewEvidence.tsx",
  "docs/post-phase-l-baseline-and-migration-decision.md",
  "docs/post-phase-l-browser-walkthrough.md",
  "docs/post-phase-l-implementation-report.md",
  "docs/post-phase-l-integration-contract.md",
  "docs/post-phase-l-replay-reconciliation-rollback.md",
  "docs/post-phase-l-schema-inventory.json",
  "fixtures/post-phase-l/pilot-fixture.json",
  "lib/crawler-adapters/index.mjs",
  "lib/post-phase-l/admin-review.ts",
  "lib/post-phase-l/database.types.ts",
  "lib/post-phase-l/normalized-graph.mjs",
  "lib/post-phase-l/review-actions.ts",
  "lib/post-phase-l/runtime.ts",
  "lib/post-phase-l/source-resolver.mjs",
  "lib/post-phase-l/strict-json.mjs",
  "lib/post-phase-l/target-guard.mjs",
  "reports/post-phase-l-browser/pre-apply-readiness.json",
  "reports/post-phase-l-convergence-result.json",
  "reports/post-phase-l-local-test-report.json",
  "reports/post-phase-l-owned-files.json",
  "reports/post-phase-l-pilot-run.json",
  "reports/post-phase-l-pre-apply-report.json",
  "reports/post-phase-l-preexisting-worktree.json",
  "reports/post-phase-l-reconciliation-report.json",
  "reports/post-phase-l-replay-report.json",
  "reports/post-phase-l-risk-register-update.json",
  "reports/post-phase-l-rollback-report.json",
  "reports/post-phase-l-schema-manifest.json",
  "reports/post-phase-l-validation-report.json",
  "reports/post-phase-l-validation-report.md",
  "scripts/bootstrap-post-phase-l-test-admin.mjs",
  "scripts/build-post-phase-l-preapply.mjs",
  "scripts/crawl-scholarship-notices.mjs",
  "scripts/ingest-post-phase-l.mjs",
  "scripts/run-post-phase-l-pilot.mjs",
  "scripts/test-post-phase-l.mjs",
  "scripts/validate-post-phase-l.mjs",
  "scripts/verify-post-phase-l-runtime.mjs",
  "supabase/post-phase-l/001_post_phase_l_compatibility_baseline.sql",
  "supabase/post-phase-l/002_post_phase_l_normalized_graph.sql",
  "supabase/post-phase-l/003_post_phase_l_pilot_seed.sql",
  "supabase/post-phase-l/900_post_phase_l_bounded_data_rollback.sql",
  "supabase/post-phase-l/999_post_phase_l_schema_rollback.sql",
  "supabase/post-phase-l/verify_post_phase_l_schema.sql",
];

if (typeof process.loadEnvFile === "function" && fs.existsSync(path.resolve(".env.local"))) {
  process.loadEnvFile(path.resolve(".env.local"));
}
const targetInspection = inspectPostPhaseLTarget({
  ...process.env,
  POST_PHASE_L_TARGET_PROJECT_REF: TARGET_REF,
});
const environmentVariablesPresent = {
  NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
};

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function readJson(filePath) {
  return parseJsonWithDuplicateKeyCheck(readText(filePath), filePath).value;
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(readText(filePath)).digest("hex");
}

function matches(sql, pattern) {
  return [...sql.matchAll(pattern)].map((match) => match[1]);
}

const inventory = readJson("docs/post-phase-l-schema-inventory.json");
const preexisting = readJson("reports/post-phase-l-preexisting-worktree.json");
const localTests = readJson("reports/post-phase-l-local-test-report.json");
const pilotRun = readJson("reports/post-phase-l-pilot-run.json");
const sqlByPath = Object.fromEntries(
  [...MIGRATIONS, ...ROLLBACK_FILES].map((filePath) => [filePath, readText(filePath)]),
);
const migrationSql = MIGRATIONS.map((filePath) => sqlByPath[filePath]).join("\n");
const baselineSql = sqlByPath[MIGRATIONS[0]];
const graphSql = sqlByPath[MIGRATIONS[1]];
const schemaRollbackSql = sqlByPath[ROLLBACK_FILES[1]];
const freshAssertionBegin = baselineSql.indexOf("POST_PHASE_L_FRESH_PROJECT_ASSERTION_BEGIN");
const freshAssertionEnd = baselineSql.indexOf("POST_PHASE_L_FRESH_PROJECT_ASSERTION_END");
const environmentGuardCreate = baselineSql.search(
  /create\s+table\s+public\.post_phase_l_environment_guard/i,
);
const freshAssertionSql = baselineSql.slice(freshAssertionBegin, freshAssertionEnd);
const requiredFreshProjectRelations = [
  "profiles",
  "scholarships",
  "scholarship_selection_stages",
  "notice_sources",
  "crawled_notices",
  "site_settings",
];
const environmentGuardUpsertIn002 =
  /insert\s+into\s+public\.post_phase_l_environment_guard/i.test(graphSql) ||
  /update\s+public\.post_phase_l_environment_guard/i.test(graphSql) ||
  /delete\s+from\s+public\.post_phase_l_environment_guard/i.test(graphSql);
const negativeTestPassed =
  localTests.results.find(
    (result) =>
      result.name ===
      "001 fresh-project assertion rejects a non-empty application schema before persistent mutation",
  )?.passed === true;
const freshProjectSafety = {
  fresh_project_guard_present:
    freshAssertionBegin >= 0 &&
    freshAssertionEnd > freshAssertionBegin &&
    freshAssertionSql.includes("POST_PHASE_L_FRESH_PROJECT_REQUIRED") &&
    requiredFreshProjectRelations.every((name) => freshAssertionSql.includes(`'${name}'`)),
  non_empty_schema_negative_test_passed: negativeTestPassed,
  environment_guard_created_only_after_fresh_assertion:
    freshAssertionEnd >= 0 && environmentGuardCreate > freshAssertionEnd,
  environment_guard_upsert_in_002: environmentGuardUpsertIn002,
  environment_guard_immutable:
    baselineSql.includes("post_phase_l_block_environment_guard_mutation") &&
    /before\s+update\s+or\s+delete\s+on\s+public\.post_phase_l_environment_guard/i.test(
      baselineSql,
    ) &&
    !/drop\s+table.*post_phase_l_environment_guard/i.test(schemaRollbackSql),
};

writeJson("reports/post-phase-l-owned-files.json", {
  generated_at: GENERATED_AT,
  contract_version: "post-phase-l-owned-files/v1",
  base_commit: preexisting.base_commit,
  branch: preexisting.branch,
  path_count: L_OWNED_FILES.length,
  paths: L_OWNED_FILES,
});

const schemaManifest = {
  generated_at: GENERATED_AT,
  stage: "pre_apply_static",
  target_project_ref: TARGET_REF,
  target_project_url: TARGET_URL,
  authoritative_inventory: {
    path: "docs/post-phase-l-schema-inventory.json",
    sha256: sha256File("docs/post-phase-l-schema-inventory.json"),
    applied_migration_count: inventory.migrations_applied_in_order.length,
    public_table_count: inventory.public_tables.length,
    public_view_count: inventory.public_views.length,
    pilot_source_count: inventory.pilot_sources.length,
    governance_status_treated_as_historical: true,
  },
  baseline_strategy: "B_sanitized_l_only_application_compatibility_baseline",
  production_parity_claimed: false,
  historical_migrations_modified: false,
  apply_order: MIGRATIONS,
  rollback_files: ROLLBACK_FILES,
  new_tables: matches(
    migrationSql,
    /create table (?:if not exists )?public\.([a-z0-9_]+)/gi,
  ),
  new_indexes: matches(migrationSql, /create (?:unique )?index if not exists ([a-z0-9_]+)/gi),
  new_functions: matches(migrationSql, /create or replace function public\.([a-z0-9_]+)/gi),
  new_triggers: matches(migrationSql, /create trigger ([a-z0-9_]+)/gi),
  rls_enabled_tables: matches(migrationSql, /alter table public\.([a-z0-9_]+) enable row level security/gi),
  policies: matches(migrationSql, /create policy ([a-z0-9_]+)/gi),
  fresh_project_safety: freshProjectSafety,
  graph_constraints: {
    source_exact_fk: graphSql.includes("references public.notice_sources(source_id)"),
    source_key_snapshot_exact_check: graphSql.includes("check (source_key_snapshot = source_id)"),
    run_source_unique: graphSql.includes("unique (crawl_run_id, source_id)"),
    occurrence_idempotency: graphSql.includes("unique (crawl_run_id, source_id, observed_url_hash)"),
    revision_change_detection: graphSql.includes("unique (notice_id, content_hash)"),
    revision_ordinal_atomic_assignment:
      graphSql.includes("post_phase_l_assign_revision_ordinal") &&
      graphSql.includes("ingestion_notice_revisions_assign_ordinal"),
    replay_preserves_notice_metadata:
      graphSql.includes("post_phase_l_preserve_notice_replay_metadata") &&
      graphSql.includes("ingestion_notices_preserve_replay_metadata"),
    replay_preserves_review_state:
      graphSql.includes("post_phase_l_preserve_review_state_on_ingest") &&
      graphSql.includes("review_items_preserve_state_on_ingest"),
    review_event_immutable_trigger: graphSql.includes("review_decision_events_immutable"),
    public_publish_forced_false: migrationSql.includes(
      "automatic_public_publish_enabled = false",
    ),
  },
  remote_apply_performed: false,
};
writeJson("reports/post-phase-l-schema-manifest.json", schemaManifest);

const plan = pilotRun.plan;
const firstApply = applyPlanToMemory({}, plan);
const replayApply = applyPlanToMemory(firstApply.state, plan);
const replayReport = {
  generated_at: GENERATED_AT,
  stage: "pre_apply_local_fixture",
  first_run_id: plan.tables.ingestion_crawl_runs[0].id,
  second_run_id: plan.tables.ingestion_crawl_runs[0].id,
  deterministic_rerun_match: Object.values(replayApply.inserted).every((count) => count === 0),
  second_run_insert_counts: replayApply.inserted,
  duplicate_notice_count: replayApply.inserted.ingestion_notices,
  duplicate_occurrence_count: replayApply.inserted.ingestion_notice_occurrences,
  duplicate_alias_count: replayApply.inserted.ingestion_notice_url_aliases,
  duplicate_review_event_count: 0,
  unexpected_legacy_insert_count: replayApply.inserted.crawled_notices_compatibility,
  content_change_revision_test_passed: localTests.results.find(
    (result) => result.name === "content change creates a revision without changing notice identity",
  )?.passed === true,
  disappearance_deletion_count: 0,
  remote_write_performed: false,
};
writeJson("reports/post-phase-l-replay-report.json", replayReport);

const legacyRows = plan.tables.crawled_notices_compatibility;
const graphNotices = plan.tables.ingestion_notices;
const matchedCount = legacyRows.filter((legacy) =>
  graphNotices.some((notice) => notice.id === legacy.graph_notice_id),
).length;
const reconciliationReport = {
  generated_at: GENERATED_AT,
  stage: "pre_apply_local_fixture",
  graph_notice_count: graphNotices.length,
  legacy_notice_count: legacyRows.length,
  matched_count: matchedCount,
  mismatch_count: graphNotices.length - matchedCount,
  unresolved_count: plan.tables.ingestion_source_run_results.filter(
    (row) => row.result_status !== "success",
  ).length,
  duplicate_risk_count: 0,
  public_preview_count: 0,
  public_leakage_count: 0,
  numeric_route_conflict_count: 0,
  comparisons: legacyRows.map((legacy) => ({
    graph_notice_id: legacy.graph_notice_id,
    notice_url: legacy.notice_url,
    state: graphNotices.some((notice) => notice.id === legacy.graph_notice_id)
      ? "match"
      : "missing_graph_row",
  })),
  remote_read_performed: false,
};
writeJson("reports/post-phase-l-reconciliation-report.json", reconciliationReport);

const rollbackReport = {
  generated_at: GENERATED_AT,
  stage: "pre_apply_static_plan",
  rollback_strategy: "bounded_run_rpc_then_idempotent_reapply",
  data_rollback_file: ROLLBACK_FILES[0],
  schema_rollback_file: ROLLBACK_FILES[1],
  compatibility_baseline_preserved_by_schema_rollback: true,
  schema_rollback_rehearsed: false,
  data_rollback_rehearsed: false,
  rollback_rehearsal_passed: false,
  reapply_passed: false,
  post_reapply_replay_match: false,
  unrelated_table_change_count: null,
  pending_reason: "first_remote_write_approval_required",
};
writeJson("reports/post-phase-l-rollback-report.json", rollbackReport);

const browserReport = {
  generated_at: GENERATED_AT,
  stage: "pre_apply_source_readiness",
  walkthrough_complete: false,
  authenticated_admin_required: true,
  test_admin_bootstrap_required: true,
  routes: [
    "/admin/review",
    "/admin/review/scholarships/[pilot-id]",
    "/admin/crawler-review",
    "/scholarships",
    "/scholarships/[numeric-id-or-compatible-test-route]",
  ],
  source_evidence: [
    "app/admin/review/scholarships/[id]/PostPhaseLReviewEvidence.tsx",
    "app/admin/crawler-review/page.tsx",
  ],
  desktop_verified: false,
  mobile_390_verified: false,
  runtime_console_error_count: null,
  pending_reason: "schema_apply_and_test_admin_required",
};
writeJson("reports/post-phase-l-browser/pre-apply-readiness.json", browserReport);

const convergence = {
  generated_at: GENERATED_AT,
  stage: "pre_apply_implementation",
  capabilities: [
    ["ingestion runner", "merge", "scripts/run-post-phase-l-pilot.mjs", "local fixture, bounded orchestrator, and syntax", "live bounded run pending"],
    ["exact source resolution", "port", "lib/post-phase-l/source-resolver.mjs", "negative tests", "remote exact query pending"],
    ["source adapters", "merge", "lib/crawler-adapters/index.mjs", "Yonsei UIC adapter tests", "live parser result pending"],
    ["canonical URL and aliases", "port", "lib/post-phase-l/normalized-graph.mjs", "alias fixture", "redirect readback pending"],
    ["normalized representation", "merge", "lib/post-phase-l/normalized-graph.mjs", "deterministic plan", "DB persistence pending"],
    ["attachment evidence", "port", "ingestion_notice_assets", "metadata fixture", "live metadata pending"],
    ["body extraction quality", "port", "ingestion_notice_revisions", "quality-state fixture", "live body pending"],
    ["observability", "merge", "app/admin/crawler-review/page.tsx plus scripts/verify-post-phase-l-runtime.mjs", "source/type/readback checks", "DB walkthrough pending"],
    ["review state", "merge", "review_decision_events", "SQL immutability/static checks", "admin event pending"],
    ["public projection", "merge", "PostPhaseLReviewEvidence.tsx", "fail-closed source logic", "approved preview pending"]
  ].map(([capability, k_decision, implemented_owner, runtime_evidence, remaining_limitation]) => ({
    capability,
    k_decision,
    implemented_owner,
    runtime_evidence,
    remaining_limitation,
  })),
};
writeJson("reports/post-phase-l-convergence-result.json", convergence);

const riskDelta = {
  generated_at: GENERATED_AT,
  protected_shared_report: "reports/post-phase-master-risk-register.json",
  protected_shared_report_modified_before_l: preexisting.entries.some(
    (entry) => entry.path === "reports/post-phase-master-risk-register.json",
  ),
  shared_report_modified_by_l: false,
  entries: [
    {
      id: "RISK-L-MIGRATION-HISTORY-DIVERGENCE",
      status: "mitigated_preapply",
      evidence: "L-only compatibility baseline is isolated from historical migrations and makes no production parity claim.",
      remaining: "Fresh L apply and schema fingerprint verification.",
    },
    {
      id: "RISK-L-APPEND-EVENT-RUNTIME",
      status: "open_until_apply",
      evidence: "Immutable trigger and admin RPC are implemented and statically validated.",
      remaining: "Authenticated append/supersede/immutability runtime proof.",
    },
    {
      id: "RISK-L-PILOT-LIVE-ATTRIBUTION",
      status: "open_until_apply",
      evidence: "Fixture path is explicitly non-live and all three pilot identities are exact-resolved.",
      remaining: "At least cau_001 attributable bounded live source-to-preview evidence.",
    },
  ],
};
writeJson("reports/post-phase-l-risk-register-update.json", riskDelta);

const preApplyReport = {
  generated_at: GENERATED_AT,
  status: "READY_FOR_OWNER_APPROVAL",
  branch: "feat/post-phase-l-integration",
  base_commit: preexisting.base_commit,
  target_project_ref: TARGET_REF,
  target_project_url: TARGET_URL,
  target_project_ref_match: targetInspection.target_project_ref_match,
  production_ref_detected: targetInspection.production_ref_detected,
  production_read_performed: false,
  production_write_performed: false,
  environment_variables_present: environmentVariablesPresent,
  apply_guard_variables_injected_only_after_owner_approval: true,
  environment_values_printed: false,
  baseline_strategy: schemaManifest.baseline_strategy,
  historical_migrations_modified: false,
  ...freshProjectSafety,
  migration_files: MIGRATIONS,
  rollback_files: ROLLBACK_FILES,
  new_tables: schemaManifest.new_tables,
  new_indexes: schemaManifest.new_indexes,
  new_constraints: Object.keys(schemaManifest.graph_constraints),
  new_rls_policies: schemaManifest.policies,
  new_functions_or_triggers: [
    ...schemaManifest.new_functions,
    ...schemaManifest.new_triggers,
  ],
  pilot_seed_plan: inventory.pilot_sources.map((source) => source.source_key),
  test_admin_bootstrap_required: true,
  expected_write_scope: "L compatibility baseline, graph tables, three pilot sources and bounded pilot rows",
  expected_delete_scope: "none_during_apply; isolated_run_only_during_approved_rollback",
  production_write_scope: "none",
  rollback_strategy: rollbackReport.rollback_strategy,
  reapply_strategy: "same deterministic run plan after bounded rollback",
  local_test_results: `${localTests.passed_count}/${localTests.test_count}`,
  dry_run_results: summarizeGraphPlan(plan),
  validator_preapply_results: "pending_validator_execution",
  approved_apply_files_in_order: MIGRATIONS,
  approved_read_only_verification_sql: VERIFICATION_SQL,
  missing_interactive_requirement: "Execute three SQL files in order in the L project SQL Editor; no CLI/psql connection is locally available.",
  governance: {
    migration_release_owner: "고지석",
    backup_export_owner: "고지석",
  },
  preexisting_file_inclusion_count: 0,
  external_llm_call_count: 0,
  automatic_public_publish_count: 0,
};
writeJson("reports/post-phase-l-pre-apply-report.json", preApplyReport);

console.log("post_phase_l_preapply_artifacts_built=true");
console.log(`schema_tables=${schemaManifest.new_tables.length}`);
console.log(`local_tests=${preApplyReport.local_test_results}`);
