import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(root, ".tmp/engine-phase-2-gate-b/fixture-results.json");
const livePath = path.join(root, ".tmp/engine-phase-2-gate-b/live-summary.json");
const outputPath = path.join(root, "reports/engine-phase-2-gate-b-baseline.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const live = JSON.parse(fs.readFileSync(livePath, "utf8"));
const scenario = (name) => fixture.scenarios?.[name] ?? {};
const passed = (name) => fixture.validations?.some((row) => row.name === name && row.passed === true);

const schema = scenario("checkpoint schema is versioned and deterministic");
const explicitResume = scenario("resume is explicit opt-in and existing checkpoint is protected");
const atomic = scenario("atomic write uses temp rename and preserves existing checkpoint on failure");
const fingerprint = scenario("configuration and source fingerprints are deterministic and scoped");
const failClosed = scenario("corrupt and incompatible checkpoints fail closed before scheduling");
const sourceSkip = scenario("completed source is skipped before scheduling");
const itemSkip = scenario("completed work item is skipped before detail and parser scheduling");
const recovery = scenario("external cancellation saves progress and resumed run is equivalent");
const settle = scenario("bounded settle returns abandoned evidence without unlimited wait");
const lateCallback = scenario("cancelled checkpoint rejects late completion callbacks");
const settleTimer = scenario("bounded settle clears losing grace timers");
const delay = scenario("retry and rate-limit delays remain cancellable");
const signals = scenario("SIGINT and SIGTERM handlers are deterministic and cleaned up");
const cache = scenario("Phase 3 parser cache stays separate and reusable");
const changedPaths = execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "status", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
}).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replaceAll("\\", "/"));

const allFixturePassed = fixture.test_count > 0 && fixture.passed_count === fixture.test_count;
const liveValid = live.invariants?.interrupted_cancelled === true &&
  live.invariants?.cancellation_checkpoint_saved === true &&
  live.invariants?.final_checkpoint_completed === true &&
  live.invariants?.resumed_skipped_source_count >= 1 &&
  live.invariants?.duplicate_identity_count === 0;
const result = allFixturePassed && liveValid ? "PASS" : "FAIL";

const report = {
  official_phase: "Engine Phase 2 — 반복 수집 안정성",
  official_gate: "Engine Phase 2 Completion — Gate B",
  official_task: "Checkpoint, Resume, Graceful Cancellation, and Recovery",
  result,
  generated_at: new Date().toISOString(),
  inputs: {
    fixture_result: ".tmp/engine-phase-2-gate-b/fixture-results.json",
    live_result: ".tmp/engine-phase-2-gate-b/live-summary.json",
  },
  checkpoint_schema_version: schema.schema_version ?? null,
  checkpoint_schema_versioned: passed("checkpoint schema is versioned and deterministic") && schema.schema_version > 0,
  checkpoint_atomic_write_verified: passed("atomic write uses temp rename and preserves existing checkpoint on failure"),
  checkpoint_temp_write_then_rename: atomic.temp_write_then_rename === true,
  checkpoint_existing_file_preserved_on_failure: atomic.existing_preserved === true,
  configuration_fingerprint_verified: fingerprint.meaningful_change_detected === true && fingerprint.secret_excluded === true,
  source_set_fingerprint_verified: fingerprint.source_order_independent === true,
  checkpoint_corrupt_fail_closed: failClosed.corrupt_code === "checkpoint_corrupt_json" && failClosed.scheduled_count === 0,
  checkpoint_incompatible_fail_closed: failClosed.incompatible_code === "checkpoint_runner_mismatch" && failClosed.scheduled_count === 0,
  resume_explicit_opt_in: explicitResume.resume_explicit === true && explicitResume.existing_checkpoint_protected === true,
  completed_source_skip_verified: sourceSkip.reexecuted_completed_source_count === 0,
  completed_work_item_skip_verified: itemSkip.reexecuted_completed_work_item_count === 0 && itemSkip.parser_calls_for_completed_item === 0,
  resume_duplicate_identity_count: recovery.resume_duplicate_identity_count,
  resume_reexecuted_completed_source_count: sourceSkip.reexecuted_completed_source_count,
  resume_reexecuted_completed_work_item_count: itemSkip.reexecuted_completed_work_item_count,
  external_abort_signal_verified: recovery.interrupted_status === "cancelled",
  sigint_graceful_cancellation_verified: signals.sigint_verified === true,
  sigterm_graceful_cancellation_verified: signals.sigterm_verified === true,
  scheduling_stopped_after_cancellation: recovery.resumed_skip_source_count >= 1 && lateCallback.late_completed_source_count === 0 && lateCallback.late_completed_work_item_count === 0,
  retry_sleep_cancelled: delay.retry_timer_cleared >= 1,
  rate_limit_sleep_cancelled: delay.rate_limit_cancelled_wait_count >= 1,
  inflight_bounded_settle_verified: settle.unlimited_wait === false && settle.abandoned_count === 1,
  cancellation_checkpoint_saved: recovery.checkpoint_saved === true,
  cancelled_result_explicit: recovery.interrupted_status === "cancelled",
  dangling_timer_count: Number(delay.dangling_timer_count) + Number(settleTimer.dangling_settle_timer_count),
  dangling_signal_listener_count: signals.dangling_signal_listener_count,
  uninterrupted_vs_resumed_identity_match: recovery.uninterrupted_vs_resumed_identity_match,
  uninterrupted_vs_resumed_core_structure_match: recovery.uninterrupted_vs_resumed_core_structure_match,
  resume_second_execution_new_result_count: recovery.resume_second_execution_new_result_count,
  phase_3_parser_cache_separation_verified: cache.checkpoint_contains_full_document_text === false,
  phase_3_cache_reuse_on_resume_verified: cache.cache_hit_on_resume === true,
  checkpoint_contains_raw_document_bytes: cache.checkpoint_contains_raw_document_bytes,
  checkpoint_contains_full_document_text: cache.checkpoint_contains_full_document_text,
  fixture: {
    test_count: fixture.test_count,
    passed_count: fixture.passed_count,
    failed_count: fixture.failed_count,
    validations: fixture.validations,
  },
  live: {
    source_keys: live.source_keys,
    bounds: live.bounds,
    runtime_path: live.runtime_path,
    interrupted: live.interrupted,
    resumed: live.resumed,
    invariants: live.invariants,
  },
  safety: {
    database_accessed: fixture.safety?.database_accessed === true || live.safety?.database_read_performed === true,
    database_written: live.safety?.database_write_performed === true,
    production_accessed: fixture.safety?.production_accessed === true || live.safety?.production_access_performed === true,
    external_llm_called: fixture.safety?.external_llm_called === true || Number(live.safety?.external_llm_call_count) > 0,
    migration_created_or_executed: fixture.safety?.migration_created_or_executed === true || live.safety?.migration_performed === true,
    production_scheduler_added: changedPaths.some((name) => /(?:cron|scheduler)/i.test(name)),
    queue_or_worker_added: changedPaths.some((name) => /(?:queue|worker)/i.test(name)),
    full_613_source_run: live.safety?.full_source_run_performed === true,
  },
  architecture: {
    gate_a_reimplemented: changedPaths.some((name) => name.includes("engine-phase-2-gate-a")),
    parallel_runner_added: live.runtime_path?.parallel_runner_created === true,
    second_source_identity_added: changedPaths.some((name) => name.includes("source-resolver")),
    second_normalized_graph_added: changedPaths.some((name) => name.includes("normalized-graph")),
    database_checkpoint_added: changedPaths.some((name) => name.startsWith("supabase/")),
    phase_3_cache_is_checkpoint: false,
  },
  limitations: [
    "Local single-process checkpoint only.",
    "Concurrent processes must not share one checkpoint path.",
    "No distributed coordination or database-backed durability.",
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`engine_phase_2_gate_b_result=${report.result}`);
console.log(`fixture_tests=${fixture.passed_count}/${fixture.test_count}`);
console.log(`live_sources=${live.bounds.source_count}`);
console.log(`report=${outputPath}`);
if (report.result !== "PASS") process.exitCode = 1;
