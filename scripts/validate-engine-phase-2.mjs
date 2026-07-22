import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCrawlerRunSummary } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.resolve(root, process.argv[2] ?? "reports/engine-phase-2-baseline.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const checks = [];
const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });

check("phase identity", report.phase === "engine-phase-2");
check("computed overall result", report.overall_result === "PASS");
check("default timeout 25 seconds", report.timeout_configuration?.default_ms === 25000);
check("default retry one", report.retry_configuration?.default_retry_count === 1);
check("default maximum attempts two", report.retry_configuration?.maximum_attempt_count_default === 2);
check("default retry backoff one second", report.retry_configuration?.default_retry_backoff_ms === 1000);
check("live retry backoff one second", report.retry_configuration?.live_retry_backoff_ms === 1000);
check("fixture scenarios pass", report.fixture_validation?.scenario_count > 0 && report.fixture_validation?.failed_count === 0);
check("deterministic rerun", report.fixture_validation?.deterministic_rerun_match === true);
check("source isolation", report.fixture_validation?.multi_source_isolation_valid === true);
check("retry validation", report.fixture_validation?.retry_validation_passed === true);
check("backoff validation", report.fixture_validation?.backoff_validation_passed === true);
check("non-retryable no backoff", report.fixture_validation?.non_retryable_no_backoff_valid === true);
check("linear backoff sequence", report.fixture_validation?.linear_backoff_sequence_valid === true);
check("evidence diff self-test", report.fixture_validation?.evidence_diff_self_test_valid === true);
check("timeout cleanup", report.fixture_validation?.timeout_cleanup_valid === true);
check("fixture arithmetic", report.fixture_validation?.arithmetic_validation_passed === true);
check("normalized graph compatibility", report.fixture_validation?.normalized_graph_compatible === true);
check("live source count", report.live_dry_run?.source_count === report.live_dry_run?.source_results?.length);
check("live item bound", report.live_dry_run?.source_results?.every((source) => source.item_count <= report.live_dry_run.max_items_per_source));
check("live detail error count present", Number.isInteger(report.live_dry_run?.detail_error_count) && report.live_dry_run.detail_error_count >= 0);
check("live summary arithmetic", validateCrawlerRunSummary({
  requested_source_count: report.live_dry_run.source_count,
  completed_source_count: report.live_dry_run.source_count,
  successful_source_count: report.live_dry_run.source_results.filter((source) => source.final_status === "success").length,
  failed_source_count: report.live_dry_run.source_error_count,
  zero_match_source_count: report.live_dry_run.source_results.filter((source) => source.final_status === "empty_observed").length,
  partial_source_count: report.live_dry_run.partial_source_count,
  retried_source_count: report.live_dry_run.retried_source_count,
  recovered_after_retry_count: report.live_dry_run.recovered_after_retry_count,
  exhausted_retry_count: report.live_dry_run.exhausted_retry_count,
  total_retry_delay_ms: report.live_dry_run.total_retry_delay_ms,
  total_attempt_count: report.live_dry_run.source_results.reduce((sum, source) => sum + source.attempt_count, 0),
  total_observed_item_count: report.live_dry_run.observed_item_count,
  source_results: report.live_dry_run.source_results,
}).valid);
check("database read zero", report.safety?.database_read_performed === false);
check("database write zero", report.safety?.database_write_performed === false);
check("production access zero", report.safety?.production_access_performed === false);
check("external LLM zero", report.safety?.external_llm_call_count === 0);
check("admin UI unchanged", report.safety?.admin_ui_changed === false);
check("migration unchanged", report.safety?.migration_files_changed === false && report.safety?.migration_performed === false);
check("API cron queue absent", report.safety?.api_cron_queue_added === false);
check("raw live artifact uncommitted", report.safety?.raw_live_artifact_committed === false);
check("sensitive files unchanged", report.safety?.sensitive_file_changed === false);
check("absolute local paths absent", report.safety?.absolute_local_path_changed === false);
check("committed diff safety", report.safety?.committed_diff_safety_check_valid === true);
check("non-goals preserved", report.non_goals_preserved === true);

const failed = checks.filter((entry) => !entry.passed);
for (const entry of checks) console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.name}`);
console.log(`ENGINE PHASE 2: ${failed.length === 0 ? "PASS" : "HOLD"}`);
console.log(`checks=${checks.length - failed.length}/${checks.length}`);
if (failed.length > 0) process.exitCode = 1;
