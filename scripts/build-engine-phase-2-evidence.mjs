import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateCrawlerRunSummary } from "../lib/crawler-engine/common-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), "utf8"));
}

function gitChangedPaths() {
  const safeRoot = root.replaceAll("\\", "/");
  const result = spawnSync(
    "git",
    ["-c", `safe.directory=${safeRoot}`, "status", "--porcelain"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("Unable to inspect changed paths for evidence safety.");
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim().replaceAll("\\", "/"));
}

function isTracked(filePath) {
  const relative = path.relative(root, path.resolve(root, filePath)).replaceAll("\\", "/");
  const safeRoot = root.replaceAll("\\", "/");
  return spawnSync(
    "git",
    ["-c", `safe.directory=${safeRoot}`, "ls-files", "--error-unmatch", "--", relative],
    { cwd: root, encoding: "utf8" },
  ).status === 0;
}

const fixturePath = arg("fixture", ".tmp/engine-phase-2/fixture-validation.json");
const livePath = arg("live", ".tmp/engine-phase-2/live/scholarship-notices-latest.json");
const outputPath = arg("output", "reports/engine-phase-2-baseline.json");
const fixture = readJson(fixturePath);
const live = readJson(livePath);
const liveSummary = live.boundedExecution?.summary;
const arithmetic = validateCrawlerRunSummary(liveSummary);
const changedPaths = gitChangedPaths();
const adminUiChanged = changedPaths.some((file) => file.startsWith("app/") || file.startsWith("components/"));
const migrationChanged = changedPaths.some((file) => file.startsWith("supabase/") || /migration/i.test(file));
const rawLiveArtifactCommitted = isTracked(livePath);
const sourceResults = Array.isArray(liveSummary?.source_results) ? liveSummary.source_results : [];
const safety = live.safety ?? {};
const fixturePassed = fixture.failed_count === 0 && fixture.passed_count === fixture.scenario_count;
const liveValid =
  arithmetic.valid &&
  sourceResults.length === Number(liveSummary?.requested_source_count) &&
  safety.databaseReadPerformed === false &&
  safety.databaseWritePerformed === false &&
  safety.productionAccessPerformed === false;
const nonGoalsPreserved = !adminUiChanged && !migrationChanged;
const overallResult = fixturePassed && liveValid && !rawLiveArtifactCommitted && nonGoalsPreserved
  ? "PASS"
  : "HOLD";

const report = {
  phase: "engine-phase-2",
  generated_at: new Date().toISOString(),
  overall_result: overallResult,
  implementation_scope: "bounded timeout, retry, attempt history, source isolation, and run observability on the Phase 1 common runner",
  timeout_configuration: {
    default_ms: 25000,
    live_ms: Number(live.totals?.timeoutMs),
  },
  retry_configuration: {
    default_retry_count: 1,
    maximum_attempt_count_default: 2,
    live_retry_count: Number(live.totals?.retryCount),
  },
  fixture_validation: {
    source_count: 2,
    scenario_count: fixture.scenario_count,
    passed_count: fixture.passed_count,
    failed_count: fixture.failed_count,
    deterministic_rerun_match: fixture.deterministic_rerun_match,
    multi_source_isolation_valid: fixture.source_isolation_valid,
    retry_validation_passed: fixture.retry_validation_passed,
    timeout_cleanup_valid: fixture.timeout_cleanup_valid,
    arithmetic_validation_passed: fixture.arithmetic_validation_passed,
    normalized_graph_compatible: fixture.normalized_graph_compatible,
  },
  live_dry_run: {
    mode: "bounded_public_http_read_only",
    source_count: Number(liveSummary.requested_source_count),
    max_items_per_source: Number(live.totals?.maxItemsPerSource),
    timeout_ms: Number(live.totals?.timeoutMs),
    retry_count: Number(live.totals?.retryCount),
    source_results: sourceResults,
    observed_item_count: Number(liveSummary.total_observed_item_count),
    timeout_source_count: Number(liveSummary.timeout_source_count),
    retried_source_count: Number(liveSummary.retried_source_count),
    recovered_after_retry_count: Number(liveSummary.recovered_after_retry_count),
    exhausted_retry_count: Number(liveSummary.exhausted_retry_count),
    source_error_count: Number(liveSummary.failed_source_count),
    detail_error_count: (live.observedItems ?? []).filter((item) => Boolean(item.detailFetchError)).length,
    partial_source_count: Number(liveSummary.partial_source_count),
    overall_run_status: liveSummary.overall_run_status,
    arithmetic_validation: arithmetic,
  },
  safety: {
    database_read_performed: safety.databaseReadPerformed === true,
    database_write_performed: safety.databaseWritePerformed === true,
    production_access_performed: safety.productionAccessPerformed === true,
    external_llm_call_count: Number(safety.externalLlmCallCount) || 0,
    admin_ui_changed: adminUiChanged,
    migration_performed: false,
    migration_files_changed: migrationChanged,
    raw_live_artifact_committed: rawLiveArtifactCommitted,
    api_cron_queue_added: changedPaths.some((file) => /(^|\/)(api|cron|queue|worker)(\/|\.)/i.test(file)),
  },
  non_goals_preserved: nonGoalsPreserved,
  raw_live_artifact_path_committed: null,
  unresolved_risks: [
    "Bounded live evidence is a point-in-time observation and does not prove full-site coverage.",
    "Exceptional source-specific adapters retain their pre-existing transport behavior until individually migrated to the common strategy contract.",
  ],
};

const resolvedOutput = path.resolve(root, outputPath);
fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`engine_phase_2_result=${report.overall_result}`);
console.log(`fixture_tests=${fixture.passed_count}/${fixture.scenario_count}`);
console.log(`live_sources=${report.live_dry_run.source_count}`);
console.log(`report=${resolvedOutput}`);
