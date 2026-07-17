import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(fs.readFileSync(path.resolve(root, process.argv[2] ?? "reports/engine-phase-2-gate-a-baseline.json"), "utf8"));
const checks = [];
const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
const scenarioPassed = (name) => report.fixture_validation?.scenario_results?.find((entry) => entry.name === name)?.passed === true;
const m = report.fixture_validation?.measurements ?? {};
const live = report.bounded_live_dry_run;

check("official Gate A identity", report.phase === "Engine Phase 2 Completion — Gate A");
check("computed overall result", report.overall_result === "PASS");
check("focused suite minimum", report.fixture_validation?.scenario_count >= 39);
check("focused suite all pass", report.fixture_validation?.failed_count === 0 && report.fixture_validation?.passed_count === report.fixture_validation?.scenario_count);
check("deterministic rerun", report.fixture_validation?.deterministic_rerun_match === true);

check("Retry-After delta scenario", scenarioPassed("Retry-After delta controls attempt delay") && m.retry_after_delta_delay_ms === 5_000);
check("Retry-After date scenario", scenarioPassed("Retry-After date controls attempt delay") && m.retry_after_date_delay_ms === 5_000);
check("malformed Retry-After fallback", scenarioPassed("malformed Retry-After falls back to exponential"));
check("Retry-After maximum cap", scenarioPassed("Retry-After obeys maximum delay cap"));
check("exponential sequence measured", JSON.stringify(m.exponential_delay_sequence_ms) === JSON.stringify([100, 200, 400, 0]));
check("deterministic jitter measured", JSON.stringify(m.deterministic_jitter_bounds_ms) === JSON.stringify([800, 1_200]));
check("network recovery", scenarioPassed("transient network failure recovers"));
check("408 retry classification", scenarioPassed("HTTP 408 is retryable"));
check("429 retry classification", scenarioPassed("HTTP 429 is retryable"));
check("5xx retry classification", scenarioPassed("HTTP 5xx is retryable"));
check("401 and 403 non-retryable", scenarioPassed("HTTP 401 and 403 are not retryable"));
check("retry exhaustion", scenarioPassed("retry exhaustion is explicit"));
check("non-retryable single attempt", scenarioPassed("non-retryable error runs once"));

check("abort stops further retry", scenarioPassed("cancellation during retry delay schedules no next attempt") && m.additional_retry_count_after_abort === 0);
check("abortable timer cleanup", scenarioPassed("abortable delay clears its timer") && m.cleared_delay_timer_count === 1);
check("pre-aborted delay no timer", scenarioPassed("pre-aborted delay creates no timer"));
check("rate wait cancellable", scenarioPassed("queued rate-limit wait is cancellable"));

check("host interval measured", scenarioPassed("same host observes minimum interval") && m.observed_host_interval_ms >= 100);
check("source interval measured", scenarioPassed("same source observes minimum interval across hosts") && m.observed_source_interval_ms >= 80);
check("different hosts independent", scenarioPassed("different hosts can progress independently"));
check("host concurrency measured", scenarioPassed("host concurrency cap is enforced") && m.maximum_observed_host_concurrency === 2);

check("source concurrency one", scenarioPassed("source concurrency one is sequential"));
check("source concurrency N measured", scenarioPassed("source concurrency N is bounded") && m.maximum_observed_source_concurrency === 2);
check("detail concurrency one", scenarioPassed("detail concurrency one is sequential"));
check("detail concurrency N measured", scenarioPassed("detail concurrency N is bounded") && m.maximum_observed_detail_concurrency === 2);
check("host cap precedence measured", scenarioPassed("host cap takes precedence over detail concurrency") && m.host_cap_precedence_maximum === 1);
check("source fault isolation", scenarioPassed("one source failure does not stop other sources") && m.successful_sources_after_peer_failure === 2);
check("detail fault isolation", scenarioPassed("one detail failure does not stop sibling details") && m.successful_details_after_peer_failure === 2);
check("abort stops new scheduling", scenarioPassed("cancellation stops new bounded-map scheduling"));

check("Phase 3 disabled compatibility", scenarioPassed("document parsing disabled preserves legacy result"));
check("Phase 3 enabled compatibility", scenarioPassed("document parsing enabled remains compatible") && m.phase3_enabled_document_count === 1);
check("run summary arithmetic", scenarioPassed("run summary arithmetic remains valid"));
check("common runner reused", report.reused_foundation?.common_runner === "lib/crawler-engine/common-runner.mjs");
check("parallel runner absent", report.reused_foundation?.parallel_runner_created === false);

check("live source bound", live?.bounds?.source_count >= 2 && live?.bounds?.source_count <= 5);
check("live common runner", live?.runtime_path?.common_runner_used === true);
check("live shared limiter", live?.runtime_path?.shared_rate_limiter_used === true);
check("live no checkpoint resume", live?.runtime_path?.checkpoint_or_resume_used === false && live?.safety?.checkpoint_written === false);
check("live disabled mode notices", live?.document_parsing_disabled?.notice_count >= 2 && live?.document_parsing_disabled?.document_count === 0);
check("live enabled mode documents", live?.document_parsing_enabled?.notice_count >= 2 && live?.document_parsing_enabled?.document_count >= 2);
check("live errors zero", live?.document_parsing_disabled?.error_count === 0 && live?.document_parsing_enabled?.error_count === 0);
check("live host cap", live?.document_parsing_enabled?.maximum_observed_host_concurrency <= live?.bounds?.host_concurrency);

check("database read zero", report.safety?.database_read_performed === false);
check("database write zero", report.safety?.database_write_performed === false);
check("production access zero", report.safety?.production_access_performed === false);
check("migration zero", report.safety?.migration_performed === false && report.safety?.migration_files_changed === false);
check("external LLM zero", report.safety?.external_llm_call_count === 0);
check("admin UI unchanged", report.safety?.admin_ui_changed === false);
check("API cron queue worker unchanged", report.safety?.api_cron_queue_worker_changed === false);
check("sensitive files unchanged", report.safety?.sensitive_file_changed === false);
check("raw cache tmp untracked", report.safety?.raw_cache_tmp_artifact_tracked === false && report.safety?.raw_tracked_paths?.length === 0);
check("Gate B explicitly deferred", report.gate_b_deferred_scope?.length >= 5 && report.cancellation_delay_seam?.full_sigint_sigterm_lifecycle_implemented === false);
check("non-goals preserved", report.non_goals_preserved === true);
check("risks explicit", report.unresolved_risks?.length >= 3);

for (const entry of checks) console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.name}`);
const failed = checks.filter((entry) => !entry.passed);
console.log(`ENGINE PHASE 2 GATE A: ${failed.length === 0 ? "PASS" : "HOLD"}`);
console.log(`checks=${checks.length - failed.length}/${checks.length}`);
if (failed.length > 0) process.exitCode = 1;
