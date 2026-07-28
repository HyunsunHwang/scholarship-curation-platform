import fs from "node:fs";

const POLICY_PATH = new URL("../../config/analysis-model-policy-v1.json", import.meta.url);

export function loadModelPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
}

export function resolveModelRole(role, { modelOverride } = {}) {
  const policy = loadModelPolicy();
  const configured = policy.roles[role];
  if (!configured) throw new Error(`unknown_model_role:${role}`);
  if (modelOverride && modelOverride !== configured.model) {
    throw new Error(`unknown_pricing_for_model:${modelOverride}`);
  }
  return {
    role,
    policy_version: policy.policy_version,
    pricing_version: policy.pricing_version,
    currency: policy.currency,
    ...configured,
  };
}

export function estimateCostMicros(model, { inputTokens, outputTokens }) {
  if (!Number.isFinite(model.input_micros_per_million_tokens)
    || !Number.isFinite(model.output_micros_per_million_tokens)) {
    throw new Error(`unknown_pricing_for_model:${model.model}`);
  }
  return Math.ceil(
    (Number(inputTokens) * model.input_micros_per_million_tokens
      + Number(outputTokens) * model.output_micros_per_million_tokens) / 1_000_000,
  );
}

export function createBudgetGuard({
  maxJobs = 10,
  maxRuns = 20,
  maxEscalations = 5,
  runBudgetMicros = 500_000,
  dailyBudgetMicros = 2_000_000,
  spentTodayMicros = 0,
} = {}) {
  const state = {
    jobs: 0,
    runs: 0,
    escalations: 0,
    reserved_micros: 0,
    actual_micros: 0,
    usage_status: "not_started",
    missing_usage_runs: 0,
  };
  return {
    state,
    authorize({ estimatedCostMicros, escalation = false }) {
      const reasons = [];
      if (state.runs >= maxRuns) reasons.push("max_runs_reached");
      if (escalation && state.escalations >= maxEscalations) reasons.push("max_escalations_reached");
      if (estimatedCostMicros > runBudgetMicros) reasons.push("run_budget_exceeded");
      if (spentTodayMicros + state.reserved_micros + estimatedCostMicros > dailyBudgetMicros) {
        reasons.push("daily_budget_exceeded");
      }
      if (reasons.length) return { allowed: false, reasons, reservation_id: null };
      state.runs += 1;
      if (escalation) state.escalations += 1;
      state.reserved_micros += estimatedCostMicros;
      const reservationId = `${state.runs}:${Date.now()}`;
      return { allowed: true, reasons: [], reservation_id: reservationId, estimatedCostMicros };
    },
    recordActual({ estimatedCostMicros, actualCostMicros }) {
      const actual = Number(actualCostMicros ?? 0);
      const estimated = Number(estimatedCostMicros ?? 0);
      state.actual_micros += actual;
      state.reserved_micros = Math.max(0, state.reserved_micros - estimated + actual);
      state.usage_status = state.missing_usage_runs ? "unreconciled" : "recorded";
    },
    recordMissingUsage() {
      state.missing_usage_runs += 1;
      state.usage_status = "unreconciled";
    },
    startJob() {
      if (state.jobs >= maxJobs) return false;
      state.jobs += 1;
      return true;
    },
  };
}
