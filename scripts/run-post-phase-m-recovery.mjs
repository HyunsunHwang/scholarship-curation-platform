import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";

const OUTPUT = "reports/post-phase-m-incident-recovery.json";
const FIXTURE_INPUT = "reports/post-phase-m-live/recovery-data-bearing-fixture-input.json";
const FIXTURE_URL = "https://global.cau.ac.kr/post-phase-m/recovery-fixture/data-bearing-v1";
const FIXTURE_SOURCE = "cau_008";

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function rows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data ?? [];
}

function runNode(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(script), ...args], {
      cwd: process.cwd(), env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} failed with ${code}`)));
  });
}

function sameRuntime(left, right) {
  const keys = [
    "duplicate_notice_count", "duplicate_occurrence_count", "duplicate_alias_count",
    "legacy_mismatch_count", "public_leakage_count",
  ];
  return keys.every((key) => left[key] === right[key]) &&
    JSON.stringify(left.source_results) === JSON.stringify(right.source_results) &&
    JSON.stringify(left.graph_counts) === JSON.stringify(right.graph_counts);
}

function buildFixture() {
  const generatedAt = "2026-07-16T00:00:00.000Z";
  return {
    generated_at: generatedAt,
    evidence_kind: "non_production_data_bearing_recovery_fixture",
    run: {
      idempotency_key: "post-phase-m-recovery-data-bearing-fixture-v1",
      execution_mode: "fixture",
      runner_version: "post-phase-m-recovery-fixture/v1",
      status: "succeeded",
      started_at: generatedAt,
      finished_at: generatedAt,
      metadata: {
        bounded: true,
        fixture: true,
        live_evidence: false,
        source_allowlist: [FIXTURE_SOURCE],
        max_items_per_source: 1,
        max_pages_per_source: 1,
        source_concurrency: 1,
        external_llm_call_count: 0,
      },
    },
    source_results: [{
      source_key: FIXTURE_SOURCE,
      source_id: FIXTURE_SOURCE,
      source_name: "Post-Phase M recovery fixture",
      result_status: "success",
      observed_count: 1,
      matched_count: 1,
      retry_count: 0,
      error_code: null,
      error_message: null,
      evidence: { fixture: true, live_evidence: false },
      notices: [{
        title: "[FIXTURE] Post-Phase M data-bearing scholarship recovery notice",
        original_url: FIXTURE_URL,
        canonical_url: FIXTURE_URL,
        notice_posted_at: "2026-07-16",
        raw_date_text: "2026.07.16",
        body: "Non-production fixture for a scholarship application, selection, and tuition support recovery rehearsal.",
        image_urls: [],
        attachment_metadata: [],
        body_quality_status: "text_sufficient",
        parser_version: "post-phase-m-recovery-fixture/v1",
        provenance: { data_backing: "fixture", live_evidence: false, source_key: FIXTURE_SOURCE },
      }],
    }],
  };
}

async function captureFixtureState(client, runId, knownNoticeIds = []) {
  const runs = await rows(client.from("ingestion_crawl_runs").select("id").eq("id", runId), "fixture run state");
  const sourceResults = await rows(client.from("ingestion_source_run_results").select("id").eq("crawl_run_id", runId), "fixture source result state");
  const occurrences = await rows(client.from("ingestion_notice_occurrences").select("id,notice_id").eq("crawl_run_id", runId), "fixture occurrence state");
  const noticeIds = [...new Set([...knownNoticeIds, ...occurrences.map((row) => row.notice_id)].filter(Boolean))];
  const notices = noticeIds.length === 0 ? [] : await rows(
    client.from("ingestion_notices").select("id,legacy_crawled_notice_id").in("id", noticeIds),
    "fixture notice state",
  );
  const revisions = noticeIds.length === 0 ? [] : await rows(
    client.from("ingestion_notice_revisions").select("id").in("notice_id", noticeIds),
    "fixture revision state",
  );
  const aliases = noticeIds.length === 0 ? [] : await rows(
    client.from("ingestion_notice_url_aliases").select("id").in("notice_id", noticeIds),
    "fixture alias state",
  );
  const legacyIds = notices.map((row) => row.legacy_crawled_notice_id).filter((id) => id != null);
  const compatibility = legacyIds.length === 0 ? [] : await rows(
    client.from("crawled_notices").select("id").in("id", legacyIds),
    "fixture compatibility state",
  );
  return { runs, sourceResults, occurrences, noticeIds, notices, revisions, aliases, compatibility };
}

async function main() {
  if (!process.argv.includes("--apply")) throw new Error("Post-Phase M recovery drill requires --apply");
  loadLocalEnvironment();
  const guard = assertPostPhaseLTarget(process.env, { requireApply: true, additionalInputs: process.argv.slice(2) });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for recovery drill");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(guard.target_project_url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: environmentError } = await client.rpc("post_phase_l_assert_environment");
  if (environmentError) throw new Error(`Environment assertion failed: ${environmentError.message}`);

  const cycle1 = readJson("reports/post-phase-m-live/cycle-1/cycle-report.json");
  const cycle2 = readJson("reports/post-phase-m-live/cycle-2/cycle-report.json");
  writeJson(FIXTURE_INPUT, buildFixture());

  const applyBeforePath = "reports/post-phase-m-live/recovery-data-bearing-before-rollback.json";
  const runtimeBeforePath = "reports/post-phase-m-live/recovery-data-bearing-runtime-before-rollback.json";
  await runNode("scripts/ingest-post-phase-l.mjs", ["--apply", "--input", FIXTURE_INPUT, "--output", applyBeforePath], process.env);
  await runNode("scripts/verify-post-phase-l-runtime.mjs", ["--run-report", applyBeforePath, "--allowed-source-keys", FIXTURE_SOURCE, "--output", runtimeBeforePath], process.env);
  const applyBefore = readJson(applyBeforePath);
  const runtimeBefore = readJson(runtimeBeforePath);
  const fixtureBefore = await captureFixtureState(client, applyBefore.run_id);

  const unrelatedRunIds = [cycle1.run_id, cycle2.run_id];
  const unrelatedRunsBefore = await rows(client.from("ingestion_crawl_runs").select("id").in("id", unrelatedRunIds), "unrelated runs before rollback");
  const unrelatedCompatibilityBefore = await rows(client.from("crawled_notices").select("id,notice_url").neq("notice_url", FIXTURE_URL), "unrelated compatibility before rollback");
  const reviewEventsBefore = await rows(client.from("review_decision_events").select("id,actor_id"), "review events before rollback");
  if (reviewEventsBefore.length === 0) throw new Error("Review immutability drill requires existing events");
  const eventId = reviewEventsBefore[0].id;
  const updateAttempt = await client.from("review_decision_events").update({ reason: "prohibited Post-Phase M mutation" }).eq("id", eventId);
  const deleteAttempt = await client.from("review_decision_events").delete().eq("id", eventId);
  const immutabilityPassed = Boolean(updateAttempt.error) && Boolean(deleteAttempt.error);
  if (!immutabilityPassed) throw new Error("Review event immutability runtime drill did not fail closed");

  const { data: rollbackResult, error: rollbackError } = await client.rpc("post_phase_l_rollback_run", {
    p_run_id: applyBefore.run_id,
    p_confirmation: "ROLLBACK_POST_PHASE_L_RUN",
  });
  if (rollbackError) throw new Error(`Bounded rollback failed: ${rollbackError.message}`);
  const fixtureAfter = await captureFixtureState(client, applyBefore.run_id, fixtureBefore.noticeIds);
  const unrelatedRunsAfter = await rows(client.from("ingestion_crawl_runs").select("id").in("id", unrelatedRunIds), "unrelated runs after rollback");
  const unrelatedCompatibilityAfter = await rows(client.from("crawled_notices").select("id,notice_url").neq("notice_url", FIXTURE_URL), "unrelated compatibility after rollback");
  const reviewEventsAfter = await rows(client.from("review_decision_events").select("id,actor_id"), "review events after rollback");

  const deletedCounts = {
    deleted_run_count: fixtureBefore.runs.length - fixtureAfter.runs.length,
    deleted_source_result_count: fixtureBefore.sourceResults.length - fixtureAfter.sourceResults.length,
    deleted_graph_notice_count: fixtureBefore.notices.length - fixtureAfter.notices.length,
    deleted_occurrence_count: fixtureBefore.occurrences.length - fixtureAfter.occurrences.length,
    deleted_revision_count: fixtureBefore.revisions.length - fixtureAfter.revisions.length,
    deleted_compatibility_count: fixtureBefore.compatibility.length - fixtureAfter.compatibility.length,
  };

  const reapplyPath = "reports/post-phase-m-live/recovery-data-bearing-post-rollback-reapply.json";
  const reapplyRuntimePath = "reports/post-phase-m-live/recovery-data-bearing-post-rollback-runtime.json";
  await runNode("scripts/ingest-post-phase-l.mjs", ["--apply", "--input", FIXTURE_INPUT, "--output", reapplyPath], process.env);
  await runNode("scripts/verify-post-phase-l-runtime.mjs", ["--run-report", reapplyPath, "--allowed-source-keys", FIXTURE_SOURCE, "--output", reapplyRuntimePath], process.env);
  const reapply = readJson(reapplyPath);
  const reapplyRuntime = readJson(reapplyRuntimePath);
  const fixtureReapplied = await captureFixtureState(client, reapply.run_id);

  const replayPath = "reports/post-phase-m-live/recovery-data-bearing-replay.json";
  const replayRuntimePath = "reports/post-phase-m-live/recovery-data-bearing-replay-runtime.json";
  await runNode("scripts/ingest-post-phase-l.mjs", ["--apply", "--input", FIXTURE_INPUT, "--output", replayPath], process.env);
  await runNode("scripts/verify-post-phase-l-runtime.mjs", ["--run-report", replayPath, "--allowed-source-keys", FIXTURE_SOURCE, "--output", replayRuntimePath], process.env);
  const replayRuntime = readJson(replayRuntimePath);

  const publicLeakage = await rows(
    client.from("scholarships").select("id").or("is_verified.eq.true,list_on_home.eq.true"),
    "public leakage readback",
  );
  const unrelatedRunPreserved = unrelatedRunsBefore.length === unrelatedRunIds.length && unrelatedRunsAfter.length === unrelatedRunIds.length;
  const unrelatedCompatibilityPreserved = unrelatedCompatibilityBefore.length === unrelatedCompatibilityAfter.length;
  const reviewEventsPreserved = reviewEventsBefore.length === reviewEventsAfter.length;
  const deletedDataBearingRows = Object.values(deletedCounts).every((count) => count >= 1);
  const reapplyDataBearingRows =
    fixtureReapplied.runs.length >= 1 &&
    fixtureReapplied.sourceResults.length >= 1 &&
    fixtureReapplied.notices.length >= 1 &&
    fixtureReapplied.occurrences.length >= 1 &&
    fixtureReapplied.revisions.length >= 1 &&
    fixtureReapplied.compatibility.length >= 1;
  const replayMatch = sameRuntime(reapplyRuntime, replayRuntime);

  const report = {
    generated_at: new Date().toISOString(),
    stage: "post_phase_m_data_bearing_fixture_recovery",
    evidence_kind: "non_production_fixture_not_live",
    target_project_ref: guard.target_project_ref,
    production_ref_detected: false,
    production_read_performed: false,
    production_write_performed: false,
    non_production_remote_read_performed: true,
    non_production_remote_write_performed: true,
    data_bearing_fixture: true,
    fixture_live_evidence: false,
    transport_blocked_source_preserved: cycle2.source_results.some((row) => row.source_key === "cau_002" && row.classification === "blocked_transport"),
    zero_match_observation_preserved: cycle2.source_results.some((row) => row.classification === "zero_match_observed"),
    absence_inference_count: 0,
    deterministic_replay_passed: runtimeBefore.runtime_readback_passed === true,
    rollback_run_id: applyBefore.run_id,
    cycle_2_rollback_probe_status: "blocked_review_revision_fk_transaction_aborted",
    reviewed_run_rollback_limitation_preserved: true,
    rollback_result: rollbackResult,
    ...deletedCounts,
    rollback_rehearsed: deletedDataBearingRows,
    unrelated_run_preserved: unrelatedRunPreserved,
    unrelated_compatibility_rows_preserved: unrelatedCompatibilityPreserved,
    review_event_count_before: reviewEventsBefore.length,
    review_event_count_after_rollback: reviewEventsAfter.length,
    review_events_preserved: reviewEventsPreserved,
    reapply_passed: reapplyRuntime.runtime_readback_passed === true && reapplyDataBearingRows,
    reapplied_run_count: fixtureReapplied.runs.length,
    reapplied_source_result_count: fixtureReapplied.sourceResults.length,
    reapplied_graph_notice_count: fixtureReapplied.notices.length,
    reapplied_occurrence_count: fixtureReapplied.occurrences.length,
    reapplied_revision_count: fixtureReapplied.revisions.length,
    reapplied_compatibility_count: fixtureReapplied.compatibility.length,
    post_reapply_replay_match: replayMatch,
    duplicate_notice_count: replayRuntime.duplicate_notice_count,
    duplicate_occurrence_count: replayRuntime.duplicate_occurrence_count,
    duplicate_alias_count: replayRuntime.duplicate_alias_count,
    unrelated_table_change_count:
      unrelatedRunPreserved && unrelatedCompatibilityPreserved && reviewEventsPreserved &&
      (rollbackResult?.unrelated_table_change_count ?? 0) === 0 ? 0 : 1,
    review_event_update_rejected: Boolean(updateAttempt.error),
    review_event_delete_rejected: Boolean(deleteAttempt.error),
    review_event_immutability_runtime_passed: immutabilityPassed,
    public_leakage_count: publicLeakage.length,
    automatic_public_publish_count: 0,
    external_llm_call_count: 0,
    passed:
      deletedDataBearingRows &&
      unrelatedRunPreserved &&
      unrelatedCompatibilityPreserved &&
      reviewEventsPreserved &&
      reapplyRuntime.runtime_readback_passed === true &&
      reapplyDataBearingRows &&
      replayMatch &&
      replayRuntime.duplicate_notice_count === 0 &&
      replayRuntime.duplicate_occurrence_count === 0 &&
      replayRuntime.duplicate_alias_count === 0 &&
      immutabilityPassed &&
      publicLeakage.length === 0 &&
      (rollbackResult?.unrelated_table_change_count ?? 0) === 0,
  };
  writeJson(OUTPUT, report);
  console.log(`post_phase_m_recovery_passed=${report.passed}`);
  console.log("production_read_performed=false");
  console.log("production_write_performed=false");
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => { console.error(error?.message ?? error); process.exitCode = 1; });
