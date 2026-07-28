import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";
import { executeAnalysisJob, createReplayProvider } from "../lib/analysis/analysis-worker-core.mjs";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";
import { reconcileAnalysisJobs } from "../lib/analysis/analysis-job-reconciler.mjs";

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const next = argv[i + 1];
    result[key.slice(2)] = !next || next.startsWith("--") ? true : next;
    if (result[key.slice(2)] !== true) i += 1;
  }
  return result;
}

function loadEnv() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
}

function dbClient() {
  const guard = assertPostPhaseLTarget({
    POST_PHASE_L_TARGET_PROJECT_REF: process.env.POST_PHASE_L_TARGET_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }, { requireApply: false });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(guard.target_project_url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadBundle(client, job) {
  const [
    { data: revision, error: revisionError },
    { data: notice, error: noticeError },
    assets,
  ] =
    await Promise.all([
      client.from("ingestion_notice_revisions").select("*").eq("id", job.revision_id).single(),
      client.from("ingestion_notices").select("*").eq("id", job.notice_id).single(),
      client.from("ingestion_notice_assets").select("*").eq("revision_id", job.revision_id),
    ]);
  if (revisionError || noticeError || assets.error) {
    throw new Error("analysis_input_db_read_failed");
  }
  const [{ data: occurrence }, { data: source }] = await Promise.all([
    client.from("ingestion_notice_occurrences").select("*")
      .eq("id", revision.occurrence_id).maybeSingle(),
    client.from("notice_sources").select("source_id,source_name")
      .eq("source_id", notice.source_id).maybeSingle(),
  ]);
  return {
    job,
    revision,
    notice,
    occurrence: occurrence ?? null,
    assets: assets.data ?? [],
    source: {
      source_id: notice.source_id,
      source_name: source?.source_name ?? null,
      scholarship_dedicated: Boolean(job.metadata?.input_profile?.scholarship_dedicated),
    },
    privacy_status: job.metadata?.input_profile?.privacy_status ?? "not_scanned",
  };
}

async function persistOutcome(client, workerId, outcome) {
  if (outcome.ok) {
    const { error } = await client.rpc("finalize_notice_analysis_success", {
      p_job_id: outcome.result.job_id,
      p_worker_id: workerId,
      p_run: outcome.run,
      p_result: outcome.result,
      p_evidence: outcome.evidence,
    });
    if (error) throw new Error(`analysis_finalize_failed:${error.message}`);
    return;
  }
  if (outcome.run) {
    const { error: runError } = await client.from("notice_analysis_runs").upsert(
      outcome.run,
      { onConflict: "job_id,attempt_number", ignoreDuplicates: true },
    );
    if (runError) throw new Error(`analysis_failed_run_persist_failed:${runError.message}`);
  }
  const { error } = await client.rpc("fail_notice_analysis_job", {
    p_job_id: outcome.run?.job_id,
    p_worker_id: workerId,
    p_error_code: outcome.error.code,
    p_error_message: outcome.error.message,
    p_retryable: outcome.run?.status !== "terminal_failed",
    p_retry_delay_seconds: 60,
  });
  if (error) throw new Error(`analysis_job_fail_failed:${error.message}`);
}

async function runClaimed(client, jobs, workerId, provider) {
  const summaries = [];
  for (const job of jobs) {
    try {
      const bundle = await loadBundle(client, job);
      const outcome = await executeAnalysisJob({ ...bundle, provider });
      await persistOutcome(client, workerId, outcome);
      summaries.push({ job_id: job.id, ok: outcome.ok, error_code: outcome.error?.code ?? null });
    } catch (error) {
      summaries.push({ job_id: job.id, ok: false, error_code: String(error.message) });
    }
  }
  return summaries;
}

async function main() {
  loadEnv();
  const options = args(process.argv.slice(2));
  const mode = String(options.mode ?? "mock");
  const workerId = `notice-analysis-${process.pid}`;
  if (mode === "mock") {
    const fixturePath = path.resolve(String(
      options.fixture ?? "fixtures/analysis-unit-1/eligible-analysis.json",
    ));
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (options["revision-id"] && options["revision-id"] !== fixture.revision.id) {
      throw new Error("fixture_revision_id_mismatch");
    }
    const job = fixture.job ?? reconcileAnalysisJobs(fixture).job;
    if (!job) throw new Error("fixture_did_not_create_analysis_job");
    job.status = "leased";
    job.leased_by = workerId;
    job.attempt_count = Math.max(1, Number(job.attempt_count ?? 0));
    const provider = createReplayProvider(fixture.provider_response);
    const outcome = await executeAnalysisJob({ ...fixture, job, provider });
    console.log(JSON.stringify({
      mode,
      ok: outcome.ok,
      provider_called: outcome.provider_called,
      validation_status: outcome.run?.validation_status ?? null,
      result_id: outcome.result?.id ?? null,
      evidence_count: outcome.evidence.length,
      error_code: outcome.error?.code ?? null,
      writes_performed: false,
    }, null, 2));
    if (!outcome.ok) process.exitCode = 1;
    return;
  }
  if (!options["allow-live-provider"]) throw new Error("--allow-live-provider is required");
  if (mode === "queue-consumer" && !options["allow-db-queue"]) {
    throw new Error("--allow-db-queue is required");
  }
  if (!["single-live", "queue-consumer"].includes(mode)) throw new Error("unsupported_mode");
  const client = dbClient();
  const provider = { mode: "live", call: callAnthropic };
  let jobs;
  if (mode === "single-live") {
    if (!options["revision-id"]) throw new Error("--revision-id is required");
    const { data, error } = await client.rpc("claim_notice_analysis_job_by_revision", {
      p_revision_id: options["revision-id"],
      p_worker_id: workerId,
      p_lease_seconds: 300,
    });
    if (error) throw new Error(error.message);
    jobs = [data];
  } else {
    const limit = Math.max(1, Math.min(Number(options.limit ?? 3), 10));
    const { data, error } = await client.rpc("claim_notice_analysis_jobs", {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: 300,
    });
    if (error) throw new Error(error.message);
    jobs = data ?? [];
  }
  const summaries = await runClaimed(client, jobs, workerId, provider);
  console.log(JSON.stringify({ mode, claimed: jobs.length, summaries }, null, 2));
  if (summaries.some((row) => !row.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`notice_analysis_worker_failed=${error.message}`);
  process.exitCode = 1;
});
