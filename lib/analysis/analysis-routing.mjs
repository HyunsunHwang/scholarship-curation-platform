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
    const code = String(outcome.error?.code ?? "analysis_execution_failed");
    if (["analysis_execution_failed", "provider_transport_error", "provider_empty_content"]
      .includes(code)) reasons.push("provider_transport_failed");
    else reasons.push(code);
  }
  const result = outcome.result?.structured_result;
  if (result) {
    for (const path of CRITICAL_PATHS) {
      const value = path.split(".").reduce((current, key) => current?.[key], result);
      if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
        reasons.push(`business_completeness_incomplete:${path}`);
      }
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
  if (!Number.isFinite(run?.input_token_count) || !Number.isFinite(run?.output_token_count)) {
    return null;
  }
  return estimateCostMicros(model, {
    inputTokens: Number(run.input_token_count),
    outputTokens: Number(run.output_token_count),
  });
}

function reconciliationStop(job, outcome, role) {
  return {
    ok: false,
    status: "reconciliation_required",
    reasons: [outcome.error?.code
      ?? (outcome.run?.usage_status === "missing"
        ? "provider_usage_missing"
        : "provider_audit_reconciliation_required")],
    economy: role === "economy" ? outcome : null,
    escalation: role === "escalation" ? outcome : null,
    selected: null,
    decision: null,
    job_id: job.id,
    stop_routing: true,
    stop_escalation: true,
    reconciliation_required: true,
  };
}

export async function executeRoutedAnalysisJob({
  job,
  economyProvider,
  escalationProvider,
  budget,
  estimatedInputTokens = 8_000,
  estimatedOutputTokens = 2_000,
  beforeProviderRun = null,
  afterProviderRun = null,
  onProviderResponse = null,
  ...context
}) {
  if (!budget.startJob()) return { ok: false, status: "budget_blocked", reasons: ["max_jobs_reached"] };
  const economy = resolveModelRole("economy");
  const economyEstimate = estimateCostMicros(economy, {
    inputTokens: estimatedInputTokens, outputTokens: estimatedOutputTokens,
  });
  const economyAuth = budget.authorize({ estimatedCostMicros: economyEstimate });
  if (!economyAuth.allowed) return { ok: false, status: "budget_blocked", reasons: economyAuth.reasons };
  if (beforeProviderRun) await beforeProviderRun("economy");
  const first = await executeAnalysisJob({
    job, provider: economyProvider, model: economy.model, providerName: economy.provider,
    runKey: "economy", estimatedCostMicros: economyEstimate,
    onProviderResponse: onProviderResponse
      ? (receipt) => onProviderResponse("economy", economy, economyEstimate, receipt) : null,
    ...context,
  });
  if (first.run) {
    first.run.actual_cost_micros = actualCost(economy, first.run);
    first.run.usage_status = first.run.actual_cost_micros == null ? "missing" : "recorded";
    if (first.run.actual_cost_micros != null) {
      budget.recordActual({
        estimatedCostMicros: economyEstimate,
        actualCostMicros: first.run.actual_cost_micros,
      });
    } else budget.recordMissingUsage();
    if (afterProviderRun) await afterProviderRun("economy", first);
  }
  if (first.stop_routing || first.stop_escalation || first.reconciliation_required) {
    return reconciliationStop(job, first, "economy");
  }
  const reasons = escalationReasons(first, { job, assets: context.assets });
  let second = null;
  if (reasons.length) {
    const escalation = resolveModelRole("escalation");
    const escalationEstimate = estimateCostMicros(escalation, {
      inputTokens: estimatedInputTokens, outputTokens: estimatedOutputTokens,
    });
    const auth = budget.authorize({ estimatedCostMicros: escalationEstimate, escalation: true });
    if (auth.allowed) {
      if (beforeProviderRun) await beforeProviderRun("escalation");
      second = await executeAnalysisJob({
        job, provider: escalationProvider, model: escalation.model,
        providerName: escalation.provider, runKey: "escalation",
        estimatedCostMicros: escalationEstimate,
        onProviderResponse: onProviderResponse
          ? (receipt) => onProviderResponse(
            "escalation", escalation, escalationEstimate, receipt,
          ) : null,
        ...context,
      });
      if (second.run) {
        second.run.actual_cost_micros = actualCost(escalation, second.run);
        second.run.usage_status = second.run.actual_cost_micros == null ? "missing" : "recorded";
        if (second.run.actual_cost_micros != null) {
          budget.recordActual({
            estimatedCostMicros: escalationEstimate,
            actualCostMicros: second.run.actual_cost_micros,
          });
        } else budget.recordMissingUsage();
        if (afterProviderRun) await afterProviderRun("escalation", second);
      }
      if (second.stop_routing || second.stop_escalation || second.reconciliation_required) {
        const stopped = reconciliationStop(job, second, "escalation");
        stopped.economy = first;
        return stopped;
      }
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
