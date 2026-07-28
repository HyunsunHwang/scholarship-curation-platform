import { executeRoutedAnalysisJob } from "./analysis-routing.mjs";
import { createBudgetGuard } from "./model-routing-policy.mjs";
import { persistRoutedOutcomeViaRpc } from "./analysis-routed-persistence.mjs";
import { callAnthropic } from "./anthropic-provider.mjs";
import { createReplayProvider } from "./analysis-worker-core.mjs";

export async function loadAnalysisJobBundle(client, job) {
  const [
    { data: revision, error: revisionError },
    { data: notice, error: noticeError },
    assets,
  ] = await Promise.all([
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

export async function claimAnalysisJobs(client, { workerId, limit = 3, leaseSeconds = 300 }) {
  const { data, error } = await client.rpc("claim_notice_analysis_jobs", {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function processRoutedJob({
  client,
  job,
  workerId,
  budget,
  live = false,
  replayResponse = null,
}) {
  const bundle = await loadAnalysisJobBundle(client, job);
  const providerFactory = live
    ? { mode: "live", call: callAnthropic }
    : createReplayProvider(replayResponse);
  const routed = await executeRoutedAnalysisJob({
    ...bundle,
    economyProvider: providerFactory,
    escalationProvider: providerFactory,
    budget,
  });
  if (!routed.ok) {
    if (routed.status === "budget_blocked") {
      await client.rpc("fail_notice_analysis_job", {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: "budget_deferred",
        p_error_message: routed.reasons.join(","),
        p_retryable: false,
      });
      return { job_id: job.id, ok: false, status: routed.status, reasons: routed.reasons };
    }
    await client.rpc("fail_notice_analysis_job", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_error_code: "routed_analysis_failed",
      p_error_message: routed.reasons.join(","),
      p_retryable: true,
    });
    return { job_id: job.id, ok: false, status: routed.status, reasons: routed.reasons };
  }
  await persistRoutedOutcomeViaRpc(client, workerId, routed, job);
  return {
    job_id: job.id,
    ok: true,
    status: routed.status,
    selected_run_id: routed.decision.selected_run_id,
    selected_result_id: routed.decision.selected_result_id,
    actual_cost_micros: budget.state.actual_micros,
  };
}

export async function runBoundedDbConsumer({
  client,
  workerId,
  limit = 3,
  live = false,
  replayResponse = null,
  budgetOptions = {},
}) {
  const budget = createBudgetGuard(budgetOptions);
  const jobs = await claimAnalysisJobs(client, { workerId, limit });
  const summaries = [];
  for (const job of jobs) {
    try {
      summaries.push(await processRoutedJob({
        client,
        job,
        workerId,
        budget,
        live,
        replayResponse,
      }));
    } catch (error) {
      summaries.push({ job_id: job.id, ok: false, error: String(error.message) });
    }
  }
  return { claimed: jobs.length, summaries, budget: budget.state };
}
