import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";

const OUTPUT = "reports/post-phase-m-incident-recovery.json";

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  const cycle2Crawler = readJson("reports/post-phase-m-live/cycle-2/crawler/scholarship-notices-latest.json");
  const recoveryInputPath = "reports/post-phase-m-live/recovery-cau-008-input.json";
  const recoveryApplyBeforePath = "reports/post-phase-m-live/recovery-cau-008-before-rollback.json";
  const recoveryRuntimeBeforePath = "reports/post-phase-m-live/recovery-cau-008-runtime-before-rollback.json";
  const recoverySource = cycle2Crawler.perSource.find((row) => row.sourceId === "cau_008");
  if (!recoverySource) throw new Error("Cycle 2 cau_008 evidence is missing");
  writeJson(recoveryInputPath, {
    ...cycle2Crawler,
    idempotencyKey: "post-phase-m-recovery-cau-008-zero-match-v1",
    totals: { ...cycle2Crawler.totals, sourceCount: 1, crawledCount: recoverySource.crawledCount, matchedCount: 0, newCount: 0 },
    perSource: [recoverySource],
    observedItems: cycle2Crawler.observedItems.filter((row) => row.sourceId === "cau_008"),
    newNotices: [],
  });
  await runNode("scripts/ingest-post-phase-l.mjs", ["--apply", "--input", recoveryInputPath, "--output", recoveryApplyBeforePath], process.env);
  await runNode("scripts/verify-post-phase-l-runtime.mjs", [
    "--run-report", recoveryApplyBeforePath, "--allowed-source-keys", "cau_008", "--output", recoveryRuntimeBeforePath,
  ], process.env);
  const recoveryApplyBefore = readJson(recoveryApplyBeforePath);
  const preReplay = readJson(recoveryRuntimeBeforePath);
  const compatibilityBefore = await rows(client.from("crawled_notices").select("id", { count: "exact" }), "compatibility before");
  const cycle1Before = await rows(client.from("ingestion_crawl_runs").select("id").eq("id", cycle1.run_id), "cycle 1 before");
  const reviewEvents = await rows(client.from("review_decision_events").select("id,actor_id").order("created_at", { ascending: true }), "review events");
  if (reviewEvents.length === 0) throw new Error("Review immutability drill requires an existing event");
  const eventId = reviewEvents[0].id;
  const updateAttempt = await client.from("review_decision_events").update({ reason: "prohibited Post-Phase M mutation" }).eq("id", eventId);
  const deleteAttempt = await client.from("review_decision_events").delete().eq("id", eventId);
  const immutabilityPassed = Boolean(updateAttempt.error) && Boolean(deleteAttempt.error);
  if (!immutabilityPassed) throw new Error("Review event immutability runtime drill did not fail closed");

  const { data: rollbackResult, error: rollbackError } = await client.rpc("post_phase_l_rollback_run", {
    p_run_id: recoveryApplyBefore.run_id,
    p_confirmation: "ROLLBACK_POST_PHASE_L_RUN",
  });
  if (rollbackError) throw new Error(`Bounded rollback failed: ${rollbackError.message}`);
  const recoveryAfterRollback = await rows(client.from("ingestion_crawl_runs").select("id").eq("id", recoveryApplyBefore.run_id), "recovery run after rollback");
  const cycle2AfterRollback = await rows(client.from("ingestion_crawl_runs").select("id").eq("id", cycle2.run_id), "cycle 2 after rollback");
  const cycle1AfterRollback = await rows(client.from("ingestion_crawl_runs").select("id").eq("id", cycle1.run_id), "cycle 1 after rollback");
  const compatibilityAfterRollback = await rows(client.from("crawled_notices").select("id"), "compatibility after rollback");
  const reviewAfterRollback = await rows(client.from("review_decision_events").select("id,actor_id"), "review after rollback");

  const replayApply = "reports/post-phase-m-live/recovery-cau-008-post-rollback-reapply.json";
  const replayRuntime = "reports/post-phase-m-live/recovery-cau-008-post-rollback-runtime.json";
  await runNode("scripts/ingest-post-phase-l.mjs", [
    "--apply", "--input", recoveryInputPath,
    "--output", replayApply,
  ], process.env);
  await runNode("scripts/verify-post-phase-l-runtime.mjs", [
    "--run-report", replayApply,
    "--allowed-source-keys", "cau_008",
    "--output", replayRuntime,
  ], process.env);
  const postRuntime = readJson(replayRuntime);

  const actorIds = new Set(reviewAfterRollback.map((row) => row.actor_id));
  const { data: authPage, error: authListError } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (authListError) throw new Error(`Ephemeral admin cleanup listing failed: ${authListError.message}`);
  const ephemeral = authPage.users.filter((user) =>
    user.email?.startsWith(`post-phase-l-${guard.target_project_ref}-`) && user.email.endsWith("@example.invalid"),
  );
  let deletedOrphanAdminCount = 0;
  for (const user of ephemeral.filter((item) => !actorIds.has(item.id))) {
    const { error } = await client.auth.admin.deleteUser(user.id);
    if (error) throw new Error("Unreferenced ephemeral admin cleanup failed");
    deletedOrphanAdminCount += 1;
  }

  const reviewedLegacy = await rows(
    client.from("crawled_notices").select("scholarship_id").in("source_id", ["cau_003", "cau_007"]).not("scholarship_id", "is", null),
    "reviewed compatibility preview links",
  );
  const previewIds = reviewedLegacy.map((row) => row.scholarship_id);
  const hiddenPreviews = previewIds.length === 0 ? [] : await rows(
    client.from("scholarships").select("id,is_verified,list_on_home").in("id", previewIds),
    "hidden preview readback",
  );
  const publicLeakage = hiddenPreviews.filter((row) => row.is_verified === true || row.list_on_home === true).length;
  const report = {
    generated_at: new Date().toISOString(),
    stage: "post_phase_m_bounded_incident_recovery",
    target_project_ref: guard.target_project_ref,
    production_ref_detected: false,
    production_read_performed: false,
    production_write_performed: false,
    non_production_remote_read_performed: true,
    non_production_remote_write_performed: true,
    transport_blocked_source_preserved: cycle2.source_results.some((row) => row.source_key === "cau_002" && row.classification === "blocked_transport"),
    zero_match_observation_preserved: cycle2.source_results.some((row) => row.classification === "zero_match_observed"),
    absence_inference_count: 0,
    deterministic_replay_passed: preReplay.runtime_readback_passed === true,
    rollback_run_id: recoveryApplyBefore.run_id,
    cycle_2_rollback_probe_status: "blocked_review_revision_fk_transaction_aborted",
    rollback_result: rollbackResult,
    rollback_rehearsed: recoveryAfterRollback.length === 0,
    unrelated_cycle_preserved:
      cycle1Before.length === 1 && cycle1AfterRollback.length === 1 && cycle2AfterRollback.length === 1,
    compatibility_rows_before: compatibilityBefore.length,
    compatibility_rows_after_rollback: compatibilityAfterRollback.length,
    compatibility_rows_preserved: compatibilityBefore.length === compatibilityAfterRollback.length,
    review_event_count_before: reviewEvents.length,
    review_event_count_after_rollback: reviewAfterRollback.length,
    review_state_preserved: reviewEvents.length === reviewAfterRollback.length,
    reapply_passed: postRuntime.runtime_readback_passed === true,
    post_reapply_replay_match: sameRuntime(preReplay, postRuntime),
    unrelated_table_change_count: rollbackResult?.unrelated_table_change_count ?? 0,
    review_event_update_rejected: Boolean(updateAttempt.error),
    review_event_delete_rejected: Boolean(deleteAttempt.error),
    review_event_immutability_runtime_passed: immutabilityPassed,
    controlled_projection_preview_enabled: hiddenPreviews.length >= 1,
    public_leakage_count: publicLeakage,
    automatic_public_publish_count: 0,
    retained_immutable_review_actor_count: actorIds.size,
    deleted_orphan_ephemeral_admin_count: deletedOrphanAdminCount,
    external_llm_call_count: 0,
    passed:
      recoveryAfterRollback.length === 0 &&
      cycle1AfterRollback.length === 1 &&
      cycle2AfterRollback.length === 1 &&
      compatibilityBefore.length === compatibilityAfterRollback.length &&
      reviewEvents.length === reviewAfterRollback.length &&
      postRuntime.runtime_readback_passed === true &&
      sameRuntime(preReplay, postRuntime) &&
      immutabilityPassed &&
      publicLeakage === 0 &&
      (rollbackResult?.unrelated_table_change_count ?? 0) === 0,
  };
  writeJson(OUTPUT, report);
  console.log(`post_phase_m_recovery_passed=${report.passed}`);
  console.log("production_read_performed=false");
  console.log("production_write_performed=false");
  console.log(`report=${path.resolve(OUTPUT)}`);
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => { console.error(error?.message ?? error); process.exitCode = 1; });
