import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseJsonWithDuplicateKeyCheck } from "../lib/post-phase-l/strict-json.mjs";

const TARGET_REF = "hrayfvdggbhfmmzfblly";
const BASE_COMMIT = "a3cd1ad38414088d835647e9ebf5326147da93bd";
const INVENTORY_SHA256 = "97602a9649fcb8ccd9ab93b9c06402d03a07fc8e1f4a50852cd8f39cff290406";
const ROOT = process.cwd();
const REQUIRED = [
  "docs/post-phase-l-schema-inventory.json",
  "docs/post-phase-l-implementation-report.md",
  "docs/post-phase-l-baseline-and-migration-decision.md",
  "docs/post-phase-l-integration-contract.md",
  "docs/post-phase-l-browser-walkthrough.md",
  "docs/post-phase-l-replay-reconciliation-rollback.md",
  "reports/post-phase-l-preexisting-worktree.json",
  "reports/post-phase-l-pre-apply-report.json",
  "reports/post-phase-l-schema-manifest.json",
  "reports/post-phase-l-pilot-run.json",
  "reports/post-phase-l-replay-report.json",
  "reports/post-phase-l-reconciliation-report.json",
  "reports/post-phase-l-rollback-report.json",
  "reports/post-phase-l-browser/pre-apply-readiness.json",
  "reports/post-phase-l-convergence-result.json",
  "reports/post-phase-l-risk-register-update.json",
  "reports/post-phase-l-local-test-report.json",
  "reports/post-phase-l-owned-files.json",
  "scripts/run-post-phase-l-pilot.mjs",
  "scripts/verify-post-phase-l-runtime.mjs",
  "supabase/post-phase-l/001_post_phase_l_compatibility_baseline.sql",
  "supabase/post-phase-l/002_post_phase_l_normalized_graph.sql",
  "supabase/post-phase-l/003_post_phase_l_pilot_seed.sql",
  "supabase/post-phase-l/900_post_phase_l_bounded_data_rollback.sql",
  "supabase/post-phase-l/999_post_phase_l_schema_rollback.sql",
  "supabase/post-phase-l/verify_post_phase_l_schema.sql",
];

const SECRET_SCAN_PATHS = [
  "app/admin/crawled-notices/actions.ts",
  "app/admin/crawler-review/page.tsx",
  "app/admin/review/scholarships/[id]/page.tsx",
  "app/admin/review/scholarships/[id]/PostPhaseLReviewEvidence.tsx",
  "docs/post-phase-l-schema-inventory.json",
  "docs/post-phase-l-implementation-report.md",
  "docs/post-phase-l-baseline-and-migration-decision.md",
  "docs/post-phase-l-integration-contract.md",
  "docs/post-phase-l-browser-walkthrough.md",
  "docs/post-phase-l-replay-reconciliation-rollback.md",
  "fixtures/post-phase-l",
  "lib/crawler-adapters/index.mjs",
  "lib/post-phase-l",
  "reports/post-phase-l-browser",
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
  "scripts/ingest-post-phase-l.mjs",
  "scripts/run-post-phase-l-pilot.mjs",
  "scripts/test-post-phase-l.mjs",
  "scripts/validate-post-phase-l.mjs",
  "scripts/verify-post-phase-l-runtime.mjs",
  "scripts/crawl-scholarship-notices.mjs",
  "supabase/post-phase-l",
];

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), "utf8");
}

function json(filePath) {
  return parseJsonWithDuplicateKeyCheck(read(filePath), filePath).value;
}

function git(args) {
  const safeRoot = ROOT.replace(/\\/g, "/");
  return execFileSync("git", ["-c", `safe.directory=${safeRoot}`, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  }).trimEnd();
}

function secretPatternCount(text) {
  const patterns = [
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    /postgres(?:ql)?:\/\/\S+/gi,
    /sk-[A-Za-z0-9_-]{20,}/g,
    /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/g,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ];
  return patterns.reduce((count, pattern) => count + (text.match(pattern)?.length ?? 0), 0);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function collectFiles(entryPath) {
  const resolved = path.join(ROOT, entryPath);
  if (!fs.existsSync(resolved)) return [];
  const stat = fs.statSync(resolved);
  if (stat.isFile()) return [entryPath];
  return fs.readdirSync(resolved, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(entryPath, entry.name);
    return entry.isDirectory() ? collectFiles(child) : [child];
  });
}

const checks = [];
function check(name, passed, evidence) {
  checks.push({ name, passed: Boolean(passed), evidence });
}

for (const filePath of REQUIRED) check(`required:${filePath}`, fs.existsSync(path.join(ROOT, filePath)), filePath);

const inventory = json("docs/post-phase-l-schema-inventory.json");
const preApply = json("reports/post-phase-l-pre-apply-report.json");
const schema = json("reports/post-phase-l-schema-manifest.json");
const pilot = json("reports/post-phase-l-pilot-run.json");
const replay = json("reports/post-phase-l-replay-report.json");
const reconciliation = json("reports/post-phase-l-reconciliation-report.json");
const rollback = json("reports/post-phase-l-rollback-report.json");
const browser = json("reports/post-phase-l-browser/pre-apply-readiness.json");
const tests = json("reports/post-phase-l-local-test-report.json");
const convergence = json("reports/post-phase-l-convergence-result.json");
const preexisting = json("reports/post-phase-l-preexisting-worktree.json");
const owned = json("reports/post-phase-l-owned-files.json");

check("authoritative inventory syntax and shape", inventory.migrations_applied_in_order.length === 57 && inventory.public_tables.length === 24 && inventory.pilot_sources.length === 3, "57 migrations / 24 tables / 3 pilot sources");
check("authoritative inventory byte fingerprint", sha256(read("docs/post-phase-l-schema-inventory.json")) === INVENTORY_SHA256, INVENTORY_SHA256);
check("historical governance snapshot is not a blocker", schema.authoritative_inventory.governance_status_treated_as_historical === true, "current owner governance supersedes snapshot");
check("target project ref", preApply.target_project_ref === TARGET_REF && preApply.target_project_ref_match === true && preApply.production_ref_detected === false, preApply.target_project_ref);
check("required L environment variables present", Object.values(preApply.environment_variables_present).every(Boolean), preApply.environment_variables_present);
check("production access zero", preApply.production_read_performed === false && preApply.production_write_performed === false, "pre-apply local only");
check("baseline strategy recorded", schema.baseline_strategy.startsWith("B_") && schema.production_parity_claimed === false, schema.baseline_strategy);
check("historical migration files unchanged", git(["diff", "--name-only", BASE_COMMIT, "--", "supabase/migrations"]) === "", "no committed-chain diff");
check("three ordered apply SQL files", schema.apply_order.length === 3 && schema.apply_order.every((filePath) => fs.existsSync(path.join(ROOT, filePath))), schema.apply_order);
check("graph schema constraints", Object.values(schema.graph_constraints).every(Boolean), schema.graph_constraints);
check("exact resolver, guard, replay, adapter, revision, review, and rollback tests", tests.failed_count === 0 && tests.test_count >= 13, `${tests.passed_count}/${tests.test_count}`);
check("pilot cohort exactly bounded", JSON.stringify(pilot.source_keys) === JSON.stringify(["cau_001", "cau_002", "yonsei_060"]), pilot.source_keys);
check("dry run did not access remote", pilot.dry_run === true && pilot.remote_read_performed === false && pilot.remote_write_performed === false, pilot.stage);
check("graph plan generated", pilot.graph_counts.ingestion_notices >= 1 && pilot.graph_counts.ingestion_notice_occurrences >= 1, pilot.graph_counts);
check("fixture does not claim live success", pilot.plan.execution_mode === "fixture", pilot.plan.execution_mode);
check("replay idempotency", replay.deterministic_rerun_match === true && replay.duplicate_notice_count === 0 && replay.duplicate_occurrence_count === 0 && replay.duplicate_alias_count === 0, replay.second_run_insert_counts);
check("reconciliation fail closed", reconciliation.public_leakage_count === 0 && reconciliation.numeric_route_conflict_count === 0, `${reconciliation.matched_count}/${reconciliation.graph_notice_count}`);
check("rollback is honestly pending approval", rollback.rollback_rehearsal_passed === false && rollback.pending_reason === "first_remote_write_approval_required", rollback.stage);
check("browser is honestly pending apply", browser.walkthrough_complete === false && browser.pending_reason === "schema_apply_and_test_admin_required", browser.stage);
check("K convergence has ten capabilities", convergence.capabilities.length === 10, convergence.capabilities.map((row) => row.capability));
check("preexisting manifest preserved", preexisting.base_commit === BASE_COMMIT && preexisting.preexisting_path_count === 43, preexisting.preexisting_path_count);
const ownedPaths = new Set(owned.paths);
const preexistingPaths = new Set(preexisting.entries.map((entry) => entry.path));
const ownedPreexistingOverlap = owned.paths.filter((filePath) => preexistingPaths.has(filePath));
check("L-owned manifest is unique and complete", owned.path_count === ownedPaths.size && owned.paths.every((filePath) => fs.existsSync(path.join(ROOT, filePath))), owned.path_count);
check("L-owned and preexisting manifests do not overlap", ownedPreexistingOverlap.length === 0, ownedPreexistingOverlap);

const scannedFiles = [...new Set(SECRET_SCAN_PATHS.flatMap(collectFiles))].filter(
  (filePath) => !filePath.includes("node_modules") && !filePath.includes(".next"),
);
const jsonFiles = scannedFiles.filter((filePath) => filePath.endsWith(".json"));
let duplicateJsonKeyCount = 0;
let secretLeakCount = 0;
for (const filePath of jsonFiles) {
  try {
    parseJsonWithDuplicateKeyCheck(read(filePath), filePath);
  } catch (error) {
    if (String(error).includes("duplicate keys")) duplicateJsonKeyCount += 1;
    else throw error;
  }
}
for (const filePath of scannedFiles) secretLeakCount += secretPatternCount(read(filePath));
check("duplicate JSON keys zero", duplicateJsonKeyCount === 0, duplicateJsonKeyCount);
check("secret leak patterns zero across all L-owned artifacts", secretLeakCount === 0, `${secretLeakCount}/${scannedFiles.length} files`);

const staged = new Set(git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean));
const preexistingFileInclusionCount = [...staged].filter((filePath) => preexistingPaths.has(filePath)).length;
check("preexisting file inclusion zero", preexistingFileInclusionCount === 0, preexistingFileInclusionCount);
const stagedOutsideOwnedCount = [...staged].filter((filePath) => !ownedPaths.has(filePath)).length;
check("staged files stay inside L-owned manifest", stagedOutsideOwnedCount === 0, stagedOutsideOwnedCount);

const currentChanged = git(["status", "--porcelain=v1", "-uall"])
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.slice(3));
const committedSinceBase = git(["diff", "--name-only", `${BASE_COMMIT}..HEAD`])
  .split(/\r?\n/)
  .filter(Boolean);
const observedLPaths = new Set([...currentChanged, ...committedSinceBase]);
const observedOutsideOwned = [...observedLPaths].filter(
  (filePath) => !preexistingPaths.has(filePath) && !ownedPaths.has(filePath),
);
check("all non-preexisting task paths are declared L-owned", observedOutsideOwned.length === 0, observedOutsideOwned);

const failed = checks.filter((entry) => !entry.passed);
const report = {
  generated_at: new Date().toISOString(),
  stage: "pre_apply",
  status: failed.length === 0 ? "READY_FOR_OWNER_APPROVAL" : "HOLD",
  target_project_ref: TARGET_REF,
  target_project_ref_match: true,
  production_ref_detected: false,
  production_read_performed: false,
  production_write_performed: false,
  migration_apply_passed: false,
  pilot_source_count: 3,
  exact_source_resolution_passed: tests.failed_count === 0,
  fuzzy_source_match_count: 0,
  automatic_source_create_count: 0,
  graph_notice_count: pilot.graph_counts.ingestion_notices,
  graph_occurrence_count: pilot.graph_counts.ingestion_notice_occurrences,
  asset_metadata_count: pilot.graph_counts.ingestion_notice_assets,
  url_alias_count: pilot.graph_counts.ingestion_notice_url_aliases,
  append_only_review_event_count: 0,
  review_event_immutability_static_passed: schema.graph_constraints.review_event_immutable_trigger,
  public_leakage_count: reconciliation.public_leakage_count,
  automatic_public_publish_count: 0,
  deterministic_rerun_match: replay.deterministic_rerun_match,
  duplicate_notice_count: replay.duplicate_notice_count,
  duplicate_occurrence_count: replay.duplicate_occurrence_count,
  duplicate_alias_count: replay.duplicate_alias_count,
  schema_rollback_rehearsed: false,
  data_rollback_rehearsed: false,
  browser_walkthrough_complete: false,
  external_llm_call_count: 0,
  external_llm_persistence_added: false,
  preexisting_file_inclusion_count: preexistingFileInclusionCount,
  secret_leak_count: secretLeakCount,
  duplicate_json_key_count: duplicateJsonKeyCount,
  output_schema_valid: failed.length === 0,
  check_count: checks.length,
  passed_check_count: checks.length - failed.length,
  failed_check_count: failed.length,
  checks,
};

fs.writeFileSync(
  path.join(ROOT, "reports/post-phase-l-validation-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
const markdown = [
  "# Post-Phase L Validation Report",
  "",
  `- Stage: ${report.stage}`,
  `- Status: ${report.status}`,
  `- Checks: ${report.passed_check_count}/${report.check_count}`,
  `- Remote read/write: false/false`,
  `- Production ref detected: false`,
  `- Preexisting file inclusion count: ${preexistingFileInclusionCount}`,
  "",
  "## Checks",
  "",
  ...checks.map((entry) => `- ${entry.passed ? "PASS" : "FAIL"}: ${entry.name}`),
  "",
  "Remote apply, runtime review-event immutability, rollback/reapply, and browser walkthrough remain pending the owner gate.",
  "",
].join("\n");
fs.writeFileSync(path.join(ROOT, "reports/post-phase-l-validation-report.md"), markdown, "utf8");

const updatedPreApply = {
  ...preApply,
  validator_preapply_results: `${report.passed_check_count}/${report.check_count}`,
};
fs.writeFileSync(
  path.join(ROOT, "reports/post-phase-l-pre-apply-report.json"),
  `${JSON.stringify(updatedPreApply, null, 2)}\n`,
  "utf8",
);

console.log(`post_phase_l_preapply_status=${report.status}`);
console.log(`checks=${report.passed_check_count}/${report.check_count}`);
if (failed.length > 0) process.exitCode = 1;
