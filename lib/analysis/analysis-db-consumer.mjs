import fs from "node:fs";
import path from "node:path";
import { executeRoutedAnalysisJob } from "./analysis-routing.mjs";
import {
  createBudgetGuard,
  estimateCostMicros,
  resolveModelRole,
} from "./model-routing-policy.mjs";
import {
  buildProviderUsageReceipt,
  deferJobForBudgetViaRpc,
  finishPilotMemberViaRpc,
  persistProviderUsageReceiptViaRpc,
  persistRunAuditViaRpc,
  persistRoutedOutcomeViaRpc,
  reservePilotCostViaRpc,
  renewAnalysisLeaseViaRpc,
} from "./analysis-routed-persistence.mjs";
import { callAnthropic } from "./anthropic-provider.mjs";
import { createReplayProvider } from "./analysis-worker-core.mjs";

export function loadReplayFixture(fixturePath) {
  const resolved = path.resolve(fixturePath);
  if (!fs.existsSync(resolved)) throw new Error("fixture_not_found");
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch {
    throw new Error("fixture_invalid_json");
  }
  if (parsed?.provider_response == null) throw new Error("fixture_missing_provider_response");
  return parsed.provider_response;
}

export function validateLiveProviderPreflight() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("provider_credentials_missing");
  for (const role of ["economy", "baseline", "escalation"]) {
    const model = resolveModelRole(role);
    if (!model.model || !model.input_micros_per_million_tokens || !model.output_micros_per_million_tokens) {
      throw new Error(`unknown_pricing_for_model:${role}`);
    }
  }
}

export function validateBoundedDbConsumerPreflight({ live = false, fixturePath = null } = {}) {
  if (live) {
    validateLiveProviderPreflight();
    return { mode: "live", replayResponse: null };
  }
  if (fixturePath) {
    return { mode: "fixture", replayResponse: loadReplayFixture(fixturePath) };
  }
  throw new Error("bounded_db_consumer_requires_live_provider_or_fixture");
}

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

export async function claimPilotAnalysisJob(
  client,
  { workerId, pilotRunId, pilotStage, leaseSeconds = 180 },
) {
  const { data, error } = await client.rpc("claim_notice_analysis_pilot_job", {
    p_pilot_run_id: pilotRunId,
    p_stage: pilotStage,
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(`pilot_claim_failed:${error.message}`);
  return data ?? [];
}

export async function processRoutedJob({
  client,
  job,
  workerId,
  budget,
  live = false,
  replayResponse = null,
  pilotRunId = null,
}) {
  const bundle = await loadAnalysisJobBundle(client, job);
  const providerFactory = live
    ? { mode: "live", call: callAnthropic }
    : createReplayProvider(replayResponse);
  const auditErrors = [];
  let auditedRunCount = 0;
  const routed = await executeRoutedAnalysisJob({
    ...bundle,
    economyProvider: providerFactory,
    escalationProvider: providerFactory,
    budget,
    beforeProviderRun: async (role) => {
      await renewAnalysisLeaseViaRpc(client, workerId, job, 180);
      if (pilotRunId) {
        const model = resolveModelRole(role);
        const estimatedCostMicros = estimateCostMicros(model, {
          inputTokens: 8_000,
          outputTokens: 2_000,
        });
        await reservePilotCostViaRpc(
          client, workerId, pilotRunId, job, role, estimatedCostMicros,
        );
      }
    },
    onProviderResponse: pilotRunId
      ? async (role, model, estimatedCostMicros, { run, response_shape: responseShape }) => {
        const actualCostMicros = Number.isFinite(run.input_token_count)
          && Number.isFinite(run.output_token_count)
          ? estimateCostMicros(model, {
            inputTokens: run.input_token_count,
            outputTokens: run.output_token_count,
          })
          : null;
        await persistProviderUsageReceiptViaRpc(
          client,
          workerId,
          pilotRunId,
          job,
          buildProviderUsageReceipt({
            job, role, model, estimatedCostMicros, actualCostMicros,
            run, responseShape, pricingVersion: model.policy_version,
          }),
        );
      }
      : null,
    afterProviderRun: async (_role, outcome) => {
      try {
        await persistRunAuditViaRpc(client, workerId, job, outcome.run);
        auditedRunCount += 1;
      } catch (error) {
        auditErrors.push(String(error.message));
      }
    },
  });
  if (!routed.ok) {
    if (routed.status === "budget_blocked") {
      await deferJobForBudgetViaRpc(client, workerId, job, {
        reasonCodes: routed.reasons,
        errorMessage: routed.reasons.join(","),
      });
      return { job_id: job.id, ok: false, status: "budget_deferred", reasons: routed.reasons };
    }
    const { error: failError } = await client.rpc("fail_notice_analysis_job", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_error_code: "routed_analysis_failed",
      p_error_message: routed.reasons.join(","),
      p_retryable: !routed.reconciliation_required,
    });
    if (failError) auditErrors.push(`fail_notice_analysis_job_failed:${failError.message}`);
    if (pilotRunId) {
      const reconciliationRequired = auditErrors.length
        || routed.reconciliation_required
        || routed.reasons.includes("audit_failed")
        || routed.reasons.includes("provider_usage_missing");
      await finishPilotMemberViaRpc(
        client, workerId, pilotRunId, job,
        reconciliationRequired ? "reconciliation_required" : "failed",
      );
    }
    return {
      job_id: job.id,
      ok: false,
      status: auditErrors.length ? "failed_run_audit_partial_failure" : routed.status,
      reasons: routed.reasons,
      audited_run_count: auditedRunCount,
      audit_errors: auditErrors,
    };
  }
  if (auditErrors.length) {
    if (pilotRunId) {
      await finishPilotMemberViaRpc(
        client, workerId, pilotRunId, job, "reconciliation_required",
      );
    }
    throw new Error(`audit_failed:${auditErrors.join(",")}`);
  }
  await persistRoutedOutcomeViaRpc(client, workerId, routed, job);
  const pilot = pilotRunId
    ? await finishPilotMemberViaRpc(client, workerId, pilotRunId, job, "succeeded")
    : null;
  if (pilot?.status === "reconciliation_required") {
    return {
      job_id: job.id,
      ok: false,
      status: "reconciliation_required",
      reasons: ["provider_usage_missing_or_unreconciled"],
      audited_run_count: auditedRunCount,
      audit_errors: auditErrors,
    };
  }
  return {
    job_id: job.id,
    ok: true,
    status: routed.status,
    selected_run_id: routed.decision.selected_run_id,
    selected_result_id: routed.decision.selected_result_id,
    actual_cost_micros: budget.state.actual_micros,
    audited_run_count: auditedRunCount,
    audit_errors: auditErrors,
  };
}

export async function runBoundedDbConsumer({
  client,
  workerId,
  limit = 3,
  live = false,
  replayResponse = null,
  budgetOptions = {},
  claimFn = claimAnalysisJobs,
  processFn = processRoutedJob,
}) {
  const budget = createBudgetGuard(budgetOptions);
  const summaries = [];
  let claimed = 0;
  for (let processed = 0; processed < limit; processed += 1) {
    const jobs = await claimFn(client, { workerId, limit: 1, leaseSeconds: 180 });
    const job = jobs[0];
    if (!job) break;
    claimed += 1;
    try {
      summaries.push(await processFn({
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
  return { claimed, summaries, budget: budget.state };
}

export async function runBoundedPilotConsumer({
  client,
  workerId,
  pilotRunId,
  pilotStage,
  limit,
  live = false,
  replayResponse = null,
  budgetOptions = {},
  claimFn = claimPilotAnalysisJob,
  processFn = processRoutedJob,
}) {
  const stageLimit = pilotStage === "smoke" ? 1 : 4;
  if (!pilotRunId) throw new Error("pilot_run_id_required");
  if (!["smoke", "expansion"].includes(pilotStage)) throw new Error("pilot_stage_invalid");
  if (Number(limit) !== stageLimit) throw new Error(`pilot_limit_must_equal:${stageLimit}`);
  const budget = createBudgetGuard(budgetOptions);
  const summaries = [];
  for (let processed = 0; processed < stageLimit; processed += 1) {
    const jobs = await claimFn(client, {
      workerId, pilotRunId, pilotStage, leaseSeconds: 180,
    });
    if ((jobs ?? []).length > 1) throw new Error("pilot_claim_returned_multiple_jobs");
    const job = jobs?.[0];
    if (!job) break;
    try {
      summaries.push(await processFn({
        client, job, workerId, budget, live, replayResponse, pilotRunId,
      }));
    } catch (error) {
      try {
        await finishPilotMemberViaRpc(
          client, workerId, pilotRunId, job, "reconciliation_required",
        );
      } catch {
        // Preserve the original stop reason; verifier exposes the still-leased member.
      }
      summaries.push({
        job_id: job.id,
        ok: false,
        status: "reconciliation_required",
        error: String(error.message),
      });
    }
    if (!summaries.at(-1).ok) break;
  }
  return { claimed: summaries.length, summaries, budget: budget.state };
}
