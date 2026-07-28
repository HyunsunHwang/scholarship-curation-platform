import { analysisSha256, stableAnalysisUuid } from "./analysis-identifiers.mjs";
import { executeAnalysisJob } from "./analysis-worker-core.mjs";
import {
  estimateCostMicros,
  resolveModelRole,
} from "./model-routing-policy.mjs";

const CRITICAL_PATHS = [
  "program.name", "cycle.name", "application.end_date.value", "eligibility_conditions",
  "benefits",
];

export function escalationReasons(outcome, { job, assets = [] } = {}) {
  const reasons = [];
  if (!outcome.ok) {
    reasons.push(outcome.error?.code === "analysis_execution_failed"
      ? "retryable_provider_failure" : "schema_or_evidence_invalid");
  }
  const result = outcome.result?.structured_result;
  for (const path of CRITICAL_PATHS) {
    const value = path.split(".").reduce((current, key) => current?.[key], result);
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
      reasons.push(`critical_field_missing:${path}`);
    }
  }
  const uncertain = [
    result?.application?.end_date,
    ...(result?.benefits ?? []),
    result?.program,
    result?.cycle,
  ].some((value) => value?.confidence != null && Number(value.confidence) < 0.75);
  if (uncertain) reasons.push("critical_field_low_confidence");
  if (job?.metadata?.input_profile?.multiple_program_suspected) reasons.push("multiple_program_suspected");
  if (assets.length >= 3) reasons.push("attachment_heavy");
  return [...new Set(reasons)];
}

function actualCost(model, run) {
  return estimateCostMicros(model, {
    inputTokens: Number(run?.input_token_count ?? 0),
    outputTokens: Number(run?.output_token_count ?? 0),
  });
}

export async function executeRoutedAnalysisJob({
  job,
  economyProvider,
  escalationProvider,
  budget,
  estimatedInputTokens = 8_000,
  estimatedOutputTokens = 2_000,
  ...context
}) {
  if (!budget.startJob()) return { ok: false, status: "budget_blocked", reasons: ["max_jobs_reached"] };
  const economy = resolveModelRole("economy");
  const economyEstimate = estimateCostMicros(economy, {
    inputTokens: estimatedInputTokens, outputTokens: estimatedOutputTokens,
  });
  const economyAuth = budget.authorize({ estimatedCostMicros: economyEstimate });
  if (!economyAuth.allowed) return { ok: false, status: "budget_blocked", reasons: economyAuth.reasons };
  const first = await executeAnalysisJob({
    job, provider: economyProvider, model: economy.model, providerName: economy.provider,
    runKey: "economy", estimatedCostMicros: economyEstimate, ...context,
  });
  if (first.run) first.run.estimated_cost_micros = actualCost(economy, first.run);
  const reasons = escalationReasons(first, { job, assets: context.assets });
  let second = null;
  if (reasons.length) {
    const escalation = resolveModelRole("escalation");
    const escalationEstimate = estimateCostMicros(escalation, {
      inputTokens: estimatedInputTokens, outputTokens: estimatedOutputTokens,
    });
    const auth = budget.authorize({ estimatedCostMicros: escalationEstimate, escalation: true });
    if (auth.allowed) {
      second = await executeAnalysisJob({
        job, provider: escalationProvider, model: escalation.model,
        providerName: escalation.provider, runKey: "escalation",
        estimatedCostMicros: escalationEstimate, ...context,
      });
      if (second.run) second.run.estimated_cost_micros = actualCost(escalation, second.run);
    } else reasons.push(...auth.reasons.map((reason) => `escalation_blocked:${reason}`));
  }
  const selected = second?.ok ? second : first.ok ? first : null;
  const decisionFingerprint = analysisSha256(JSON.stringify({
    job_id: job.id,
    economy_run_id: first.run?.id,
    escalation_run_id: second?.run?.id,
    selected_run_id: selected?.run?.id,
    reasons,
  }));
  return {
    ok: Boolean(selected),
    status: selected ? (second?.ok ? "escalation_selected" : reasons.length ? "economy_retained" : "economy_selected") : "failed",
    reasons: [...new Set(reasons)],
    economy: first,
    escalation: second,
    selected,
    decision: {
      id: stableAnalysisUuid("notice_analysis_routing_decisions", decisionFingerprint),
      job_id: job.id,
      economy_run_id: first.run?.id ?? null,
      escalation_run_id: second?.run?.id ?? null,
      selected_run_id: selected?.run?.id ?? null,
      selected_result_id: selected?.result?.id ?? null,
      reason_codes: [...new Set(reasons)],
      policy_version: economy.policy_version,
      decision_fingerprint: decisionFingerprint,
    },
  };
}
