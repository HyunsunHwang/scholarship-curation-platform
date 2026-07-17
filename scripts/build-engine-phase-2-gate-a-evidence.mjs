import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.resolve(root, ".tmp/engine-phase-2-gate-a/fixture-summary.json");
const livePath = path.resolve(root, ".tmp/engine-phase-2-gate-a/live-summary.json");
const outputPath = path.resolve(root, "reports/engine-phase-2-gate-a-baseline.json");
const baseSha = process.argv.find((value) => value.startsWith("--base-sha="))?.slice("--base-sha=".length) ?? "d8a7d6263d4b610343e86c3c579622afeecd62af";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fixture = readJson(fixturePath);
const live = readJson(livePath);
const scenarioPassed = (name) => fixture.scenario_results?.find((entry) => entry.name === name)?.passed === true;
const safe = root.replaceAll("\\", "/");
function git(args) {
  const result = spawnSync("git", ["-c", `safe.directory=${safe}`, ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const lines = (value) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const normalize = (file) => file.replaceAll("\\", "/");
const committedPaths = lines(git(["diff", "--name-only", `${baseSha}...HEAD`])).map(normalize);
const workingPaths = [
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["diff", "--cached", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"])),
].map(normalize);
const changedPaths = [...new Set([...committedPaths, ...workingPaths])];
const trackedPaths = lines(git(["ls-files"])).map(normalize);
const forbidden = {
  admin_ui: changedPaths.filter((file) => file.startsWith("app/") || file.startsWith("components/")),
  migration: changedPaths.filter((file) => file.startsWith("supabase/") || /migration/i.test(file)),
  api_cron_queue_worker: changedPaths.filter((file) => /(^|\/)(api|cron|queue|worker)(\/|\.)/i.test(file)),
  sensitive: changedPaths.filter((file) => /(^|\/)(\.env(?:\.|$)|[^/]*secret[^/]*|[^/]*credential[^/]*|[^/]*\.pem|[^/]*\.key)$/i.test(file)),
};
const rawTracked = trackedPaths.filter((file) => changedPaths.includes(file) && /(^|\/)(\.tmp|tmp|node_modules)(\/|$)|\.(pdf|hwp|hwpx|png|jpe?g|tiff?)$/i.test(file));
const safetyPass = Object.values(forbidden).every((paths) => paths.length === 0) && rawTracked.length === 0;

const m = fixture.measurements ?? {};
const focusedPass = fixture.scenario_count >= 39 && fixture.failed_count === 0 && fixture.passed_count === fixture.scenario_count;
const retryPass = scenarioPassed("Retry-After delta controls attempt delay") &&
  scenarioPassed("Retry-After date controls attempt delay") &&
  scenarioPassed("bounded exponential sequence is deterministic") &&
  scenarioPassed("deterministic jitter uses injected random") &&
  scenarioPassed("cancellation during retry delay schedules no next attempt") &&
  m.retry_after_delta_delay_ms === 5_000 &&
  m.retry_after_date_delay_ms === 5_000 &&
  JSON.stringify(m.exponential_delay_sequence_ms) === JSON.stringify([100, 200, 400, 0]) &&
  m.additional_retry_count_after_abort === 0;
const limiterPass = scenarioPassed("same host observes minimum interval") &&
  scenarioPassed("same source observes minimum interval across hosts") &&
  scenarioPassed("host concurrency cap is enforced") &&
  m.observed_host_interval_ms >= 100 &&
  m.observed_source_interval_ms >= 80 &&
  m.maximum_observed_host_concurrency === 2;
const concurrencyPass = scenarioPassed("source concurrency N is bounded") &&
  scenarioPassed("detail concurrency N is bounded") &&
  scenarioPassed("host cap takes precedence over detail concurrency") &&
  m.maximum_observed_source_concurrency === 2 &&
  m.maximum_observed_detail_concurrency === 2 &&
  m.host_cap_precedence_maximum === 1;
const compatibilityPass = scenarioPassed("document parsing disabled preserves legacy result") &&
  scenarioPassed("document parsing enabled remains compatible") &&
  scenarioPassed("run summary arithmetic remains valid") &&
  scenarioPassed("deterministic fixture rerun matches");
const livePass = live.bounds?.source_count >= 2 && live.bounds?.source_count <= 5 &&
  live.runtime_path?.common_runner_used === true &&
  live.runtime_path?.shared_rate_limiter_used === true &&
  live.runtime_path?.checkpoint_or_resume_used === false &&
  live.document_parsing_disabled?.notice_count >= 2 &&
  live.document_parsing_disabled?.error_count === 0 &&
  live.document_parsing_disabled?.document_count === 0 &&
  live.document_parsing_enabled?.notice_count >= 2 &&
  live.document_parsing_enabled?.document_count >= 2 &&
  live.document_parsing_enabled?.error_count === 0 &&
  live.document_parsing_enabled?.maximum_observed_host_concurrency <= live.bounds?.host_concurrency &&
  live.safety?.database_read_performed === false &&
  live.safety?.database_write_performed === false &&
  live.safety?.production_access_performed === false &&
  live.safety?.checkpoint_written === false;

const report = {
  phase: "Engine Phase 2 Completion — Gate A",
  phase_key: "engine-phase-2-gate-a",
  generated_at: new Date().toISOString(),
  base_sha: baseSha,
  overall_result: focusedPass && retryPass && limiterPass && concurrencyPass && compatibilityPass && livePass && safetyPass ? "PASS" : "HOLD",
  reused_foundation: {
    common_runner: "lib/crawler-engine/common-runner.mjs",
    previous_phase_2_timeout_retry_attempt_history: true,
    phase_3_document_hook_and_cache: true,
    normalized_graph_compatibility: true,
    parallel_runner_created: false,
  },
  retry_policy: {
    retryable_categories: ["network_error", "timeout", "http_408", "http_429", "http_5xx"],
    non_retryable_categories: ["configuration_error", "source_resolution_error", "unsupported", "parser_invariant", "http_401", "http_403", "other_http_4xx", "cancellation"],
    retry_after_delta_supported: scenarioPassed("Retry-After delta controls attempt delay"),
    retry_after_http_date_supported: scenarioPassed("Retry-After date controls attempt delay"),
    exponential_sequence_ms: m.exponential_delay_sequence_ms,
    deterministic_jitter_bounds_ms: m.deterministic_jitter_bounds_ms,
    maximum_delay_enforced: scenarioPassed("Retry-After obeys maximum delay cap"),
    injected_clock_sleep_random: scenarioPassed("deterministic jitter uses injected random") && scenarioPassed("bounded exponential sequence is deterministic"),
    abort_additional_retry_count: m.additional_retry_count_after_abort,
  },
  rate_limiting: {
    source_minimum_interval_valid: m.observed_source_interval_ms >= 80,
    host_minimum_interval_valid: m.observed_host_interval_ms >= 100,
    observed_source_interval_ms: m.observed_source_interval_ms,
    observed_host_interval_ms: m.observed_host_interval_ms,
    maximum_observed_host_concurrency: m.maximum_observed_host_concurrency,
    cancellable_wait: scenarioPassed("queued rate-limit wait is cancellable"),
  },
  concurrency: {
    maximum_observed_source_concurrency: m.maximum_observed_source_concurrency,
    maximum_observed_detail_concurrency: m.maximum_observed_detail_concurrency,
    host_cap_precedence_maximum: m.host_cap_precedence_maximum,
    source_fault_isolation: scenarioPassed("one source failure does not stop other sources"),
    detail_fault_isolation: scenarioPassed("one detail failure does not stop sibling details"),
    scheduling_stops_on_abort: scenarioPassed("cancellation stops new bounded-map scheduling"),
  },
  cancellation_delay_seam: {
    abortable_delay: scenarioPassed("abortable delay clears its timer"),
    cleared_timer_count: m.cleared_delay_timer_count,
    additional_retry_count_after_abort: m.additional_retry_count_after_abort,
    full_sigint_sigterm_lifecycle_implemented: false,
  },
  fixture_validation: fixture,
  bounded_live_dry_run: live,
  gate_b_deferred_scope: [
    "versioned atomic checkpoint",
    "resume and resume idempotency",
    "SIGINT/SIGTERM graceful lifecycle",
    "cancellation checkpoint",
    "interrupted-run recovery equivalence",
  ],
  safety: {
    ...live.safety,
    admin_ui_changed: forbidden.admin_ui.length > 0,
    migration_files_changed: forbidden.migration.length > 0,
    api_cron_queue_worker_changed: forbidden.api_cron_queue_worker.length > 0,
    sensitive_file_changed: forbidden.sensitive.length > 0,
    raw_cache_tmp_artifact_tracked: rawTracked.length > 0,
    raw_tracked_paths: rawTracked,
    changed_path_count: changedPaths.length,
    safety_valid: safetyPass,
  },
  non_goals_preserved: safetyPass && live.runtime_path?.checkpoint_or_resume_used === false,
  unresolved_risks: [
    "The limiter is process-local and does not coordinate distributed crawler replicas.",
    "The bounded live sample validates two public sources only and is not nationwide coverage evidence.",
    "Full graceful shutdown, checkpoints, resume, and recovery idempotency remain explicitly deferred to Gate B.",
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`engine_phase_2_gate_a_result=${report.overall_result}`);
console.log(`fixture_tests=${fixture.passed_count}/${fixture.scenario_count}`);
console.log(`live_sources=${live.bounds.source_count}`);
console.log(`report=${outputPath}`);
if (report.overall_result !== "PASS") process.exitCode = 1;
