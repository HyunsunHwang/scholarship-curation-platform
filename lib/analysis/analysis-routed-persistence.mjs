function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return structuredClone(value);
}

export function isRunValidatedForCompletion(run) {
  return Boolean(run)
    && clean(run.status) === "succeeded"
    && clean(run.validation_status) === "validated"
    && Boolean(clean(run.finished_at));
}

export function routingDecisionMatches(existing, decision, selectedRunId, selectedResultId) {
  if (!existing || !decision) return false;
  return clean(existing.decision_fingerprint) === clean(decision.decision_fingerprint)
    && clean(existing.selected_run_id) === clean(selectedRunId)
    && clean(existing.selected_result_id) === clean(selectedResultId)
    && clean(existing.economy_run_id ?? "") === clean(decision.economy_run_id ?? "")
    && clean(existing.escalation_run_id ?? "") === clean(decision.escalation_run_id ?? "")
    && clean(existing.policy_version) === clean(decision.policy_version);
}

export function buildRoutingReplayResult({ job, decision }) {
  return {
    replayed: true,
    job_id: job.id,
    status: "succeeded",
    routing_decision_id: decision.id,
    selected_run_id: decision.selected_run_id,
    selected_result_id: decision.selected_result_id,
  };
}

export function validateRoutingLineage({ job, economy, escalation, decision, selected }) {
  const errors = [];
  if (!job?.id) errors.push("missing_job");
  if (!selected?.run || !selected?.result) errors.push("missing_selected_outcome");
  if (selected?.run && clean(selected.run.job_id) !== clean(job.id)) {
    errors.push("selected_run_job_mismatch");
  }
  if (selected?.result && clean(selected.result.job_id) !== clean(job.id)) {
    errors.push("selected_result_job_mismatch");
  }
  if (selected?.result && clean(selected.result.run_id) !== clean(selected.run?.id)) {
    errors.push("selected_result_run_mismatch");
  }
  if (decision?.selected_run_id && clean(decision.selected_run_id) !== clean(selected?.run?.id)) {
    errors.push("decision_selected_run_mismatch");
  }
  if (decision?.selected_result_id && clean(decision.selected_result_id) !== clean(selected?.result?.id)) {
    errors.push("decision_selected_result_mismatch");
  }
  if (economy?.run && clean(economy.run.job_id) !== clean(job.id)) errors.push("economy_run_job_mismatch");
  if (escalation?.run && clean(escalation.run.job_id) !== clean(job.id)) {
    errors.push("escalation_run_job_mismatch");
  }
  if (economy?.result && !isRunValidatedForCompletion(economy.run)) {
    errors.push("economy_run_not_validated");
  }
  if (escalation?.result && !isRunValidatedForCompletion(escalation.run)) {
    errors.push("escalation_run_not_validated");
  }
  if (!isRunValidatedForCompletion(selected?.run)) errors.push("selected_run_not_validated");
  if (selected?.result?.result_status !== "validated") errors.push("selected_result_not_validated");
  return { ok: errors.length === 0, errors };
}

function insertRun(state, run) {
  const exists = state.runs.some((row) =>
    clean(row.job_id) === clean(run.job_id)
    && Number(row.attempt_number) === Number(run.attempt_number)
    && clean(row.run_role) === clean(run.run_role));
  if (!exists) state.runs.push(clone(run));
}

function insertResult(state, result) {
  const exists = state.results.some((row) => clean(row.id) === clean(result.id));
  if (!exists) state.results.push(clone(result));
}

function insertEvidence(state, evidence = []) {
  for (const row of evidence) {
    const exists = state.evidence.some((existing) =>
      clean(existing.result_id) === clean(row.result_id)
      && clean(existing.field_path) === clean(row.field_path)
      && clean(existing.evidence_fingerprint) === clean(row.evidence_fingerprint));
    if (!exists) state.evidence.push(clone(row));
  }
}

function assertLease(job, workerId, now) {
  if (clean(job.leased_by) !== clean(workerId)) return "lease_owner_mismatch";
  if (!["leased", "running"].includes(clean(job.status))) return "invalid_status";
  if (!job.lease_expires_at || clean(job.lease_expires_at) <= clean(now)) return "lease_expired";
  return null;
}

export function persistBaselineSuccessInMemory({
  state = { jobs: [], runs: [], results: [], evidence: [] },
  job,
  workerId,
  outcome,
  now = new Date().toISOString(),
} = {}) {
  const next = {
    jobs: state.jobs.map((row) => clone(row)),
    runs: state.runs.map((row) => clone(row)),
    results: state.results.map((row) => clone(row)),
    evidence: state.evidence.map((row) => clone(row)),
    decisions: state.decisions ? state.decisions.map((row) => clone(row)) : [],
  };
  const jobRow = next.jobs.find((row) => clean(row.id) === clean(job.id));
  if (!jobRow) return { ok: false, reason: "job_not_found", state: next };
  const leaseError = assertLease(jobRow, workerId, now);
  if (leaseError) return { ok: false, reason: leaseError, state: next };
  if (!isRunValidatedForCompletion(outcome.run)) {
    return { ok: false, reason: "finalize_notice_analysis_success_rejected_validation", state: next };
  }
  insertRun(next, outcome.run);
  insertResult(next, outcome.result);
  insertEvidence(next, outcome.evidence);
  jobRow.status = "succeeded";
  jobRow.completed_at = now;
  jobRow.leased_by = null;
  jobRow.lease_expires_at = null;
  return { ok: true, reason: null, state: next, job: clone(jobRow) };
}

export function persistRoutedSuccessInMemory({
  state = { jobs: [], runs: [], results: [], evidence: [], decisions: [] },
  job,
  workerId,
  routedOutcome,
  now = new Date().toISOString(),
} = {}) {
  const next = {
    jobs: state.jobs.map((row) => clone(row)),
    runs: state.runs.map((row) => clone(row)),
    results: state.results.map((row) => clone(row)),
    evidence: state.evidence.map((row) => clone(row)),
    decisions: state.decisions.map((row) => clone(row)),
  };
  const jobRow = next.jobs.find((row) => clean(row.id) === clean(job.id));
  if (!jobRow) return { ok: false, reason: "job_not_found", state: next };

  const existingDecision = next.decisions.find((row) => clean(row.job_id) === clean(jobRow.id));
  const selectedRunId = routedOutcome.selected?.run?.id ?? routedOutcome.decision?.selected_run_id;
  const selectedResultId = routedOutcome.selected?.result?.id ?? routedOutcome.decision?.selected_result_id;

  if (existingDecision) {
    if (routingDecisionMatches(
      existingDecision,
      routedOutcome.decision,
      selectedRunId,
      selectedResultId,
    )) {
      return {
        ok: true,
        reason: "replayed",
        replayed: true,
        result: buildRoutingReplayResult({ job: jobRow, decision: existingDecision }),
        state: next,
        job: clone(jobRow),
      };
    }
    return { ok: false, reason: "routing_decision_conflict", state: next };
  }

  const leaseError = assertLease(jobRow, workerId, now);
  if (leaseError) return { ok: false, reason: leaseError, state: next };
  const lineage = validateRoutingLineage({
    job: jobRow,
    economy: routedOutcome.economy,
    escalation: routedOutcome.escalation,
    decision: routedOutcome.decision,
    selected: routedOutcome.selected,
  });
  if (!lineage.ok || !routedOutcome.selected) {
    return {
      ok: false,
      reason: "finalize_notice_analysis_routing_rejected",
      state: next,
      errors: lineage.errors,
    };
  }
  if (routedOutcome.economy?.run) insertRun(next, routedOutcome.economy.run);
  if (routedOutcome.escalation?.run) insertRun(next, routedOutcome.escalation.run);
  if (routedOutcome.economy?.result) insertResult(next, routedOutcome.economy.result);
  if (routedOutcome.escalation?.result) insertResult(next, routedOutcome.escalation.result);
  insertEvidence(next, routedOutcome.economy?.evidence ?? []);
  insertEvidence(next, routedOutcome.escalation?.evidence ?? []);
  next.decisions.push(clone(routedOutcome.decision));
  jobRow.status = "succeeded";
  jobRow.completed_at = now;
  jobRow.leased_by = null;
  jobRow.lease_expires_at = null;
  return { ok: true, reason: null, replayed: false, state: next, job: clone(jobRow) };
}

export function deferJobForBudgetInMemory({
  state = { jobs: [] },
  job,
  workerId,
  reasonCodes = [],
  estimatedCostMicros = null,
  now = new Date().toISOString(),
} = {}) {
  const next = { jobs: state.jobs.map((row) => clone(row)) };
  const jobRow = next.jobs.find((row) => clean(row.id) === clean(job.id));
  if (!jobRow) return { ok: false, reason: "job_not_found", state: next };
  if (clean(jobRow.status) === "budget_deferred" && clean(jobRow.last_error_code) === "budget_deferred") {
    return { ok: true, replayed: true, state: next, job: clone(jobRow) };
  }
  const leaseError = assertLease(jobRow, workerId, now);
  if (leaseError) return { ok: false, reason: leaseError, state: next };
  jobRow.status = "budget_deferred";
  jobRow.last_error_code = "budget_deferred";
  jobRow.last_error_message = reasonCodes.join(",");
  jobRow.leased_by = null;
  jobRow.lease_expires_at = null;
  jobRow.completed_at = null;
  jobRow.updated_at = now;
  if (estimatedCostMicros != null) {
    jobRow.metadata = { ...(jobRow.metadata ?? {}), estimated_cost_micros: estimatedCostMicros };
  }
  return { ok: true, replayed: false, state: next, job: clone(jobRow) };
}

export function buildRoutingRpcPayload({ job, workerId, routedOutcome }) {
  return {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_economy_run: routedOutcome.economy?.run ?? null,
    p_economy_result: routedOutcome.economy?.result ?? null,
    p_economy_evidence: routedOutcome.economy?.evidence ?? [],
    p_escalation_run: routedOutcome.escalation?.run ?? null,
    p_escalation_result: routedOutcome.escalation?.result ?? null,
    p_escalation_evidence: routedOutcome.escalation?.evidence ?? [],
    p_decision: routedOutcome.decision,
    p_selected_run_id: routedOutcome.selected?.run?.id ?? null,
    p_selected_result_id: routedOutcome.selected?.result?.id ?? null,
  };
}

export async function persistRoutedOutcomeViaRpc(client, workerId, routedOutcome, job) {
  const payload = buildRoutingRpcPayload({ job, workerId, routedOutcome });
  const { data, error } = await client.rpc("finalize_notice_analysis_routing", payload);
  if (error) throw new Error(`finalize_notice_analysis_routing_failed:${error.message}`);
  return data;
}

export async function deferJobForBudgetViaRpc(client, workerId, job, {
  reasonCodes = [],
  errorMessage = null,
  estimatedCostMicros = null,
} = {}) {
  const { data, error } = await client.rpc("defer_notice_analysis_job_for_budget", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_reason_codes: reasonCodes,
    p_error_message: errorMessage,
    p_estimated_cost_micros: estimatedCostMicros,
  });
  if (error) throw new Error(`defer_notice_analysis_job_for_budget_failed:${error.message}`);
  return data;
}

export function buildRunAudit(run) {
  if (!run) return null;
  const diagnostics = {
    provider_called: Boolean(run.metadata?.provider_called),
    response_summary: run.metadata?.response_summary ?? null,
    validation_errors: Array.isArray(run.metadata?.validation_errors)
      ? run.metadata.validation_errors.slice(0, 50)
      : [],
  };
  return {
    ...run,
    error_message: clean(run.error_message).slice(0, 500) || null,
    raw_response: null,
    raw_response_retention_until: null,
    metadata: {
      mode: clean(run.metadata?.mode).slice(0, 40) || "unknown",
      run_key: clean(run.metadata?.run_key).slice(0, 40) || clean(run.run_role),
      diagnostics,
    },
  };
}

export async function persistRunAuditViaRpc(client, workerId, job, run) {
  const audit = buildRunAudit(run);
  if (!audit) return { skipped: true };
  const { data, error } = await client.rpc("record_notice_analysis_run_audit", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_run: audit,
  });
  if (error) throw new Error(`record_notice_analysis_run_audit_failed:${error.message}`);
  return data;
}

export async function renewAnalysisLeaseViaRpc(
  client,
  workerId,
  job,
  leaseSeconds = 180,
) {
  const { data, error } = await client.rpc("renew_notice_analysis_job_lease", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(`renew_notice_analysis_job_lease_failed:${error.message}`);
  return data;
}

export function buildProviderUsageReceipt({
  job, role, model, estimatedCostMicros, actualCostMicros, run, responseShape, pricingVersion,
}) {
  const usageRecorded = Number.isFinite(run?.input_token_count)
    && Number.isFinite(run?.output_token_count)
    && Number.isFinite(actualCostMicros);
  return {
    attempt_number: Number(job.attempt_count),
    run_role: role,
    provider: model.provider,
    model: run.model ?? model.model,
    provider_request_id: run.request_id ?? null,
    input_token_count: run.input_token_count ?? null,
    output_token_count: run.output_token_count ?? null,
    cached_input_token_count: run.cached_input_token_count ?? null,
    estimated_cost_micros: Number(estimatedCostMicros),
    actual_cost_micros: usageRecorded ? Number(actualCostMicros) : null,
    usage_status: usageRecorded ? "recorded" : "missing",
    pricing_version: pricingVersion,
    request_fingerprint: job.input_fingerprint,
    response_fingerprint: run.response_fingerprint ?? null,
    safe_diagnostics: {
      content_types: responseShape?.content_types ?? [],
      stop_reason: responseShape?.stop_reason ?? null,
      json_parse_success: null,
      top_level_keys: [],
    },
  };
}

export async function persistProviderUsageReceiptViaRpc(
  client, workerId, pilotRunId, job, receipt,
) {
  const { data, error } = await client.rpc("record_notice_analysis_provider_usage", {
    p_job_id: job.id,
    p_pilot_run_id: pilotRunId,
    p_worker_id: workerId,
    p_receipt: receipt,
  });
  if (error) {
    throw Object.assign(
      new Error(`record_notice_analysis_provider_usage_failed:${error.message}`),
      { code: "audit_failed", retryable: true },
    );
  }
  return data;
}

export async function finishPilotMemberViaRpc(
  client, workerId, pilotRunId, job, memberStatus,
) {
  const { data, error } = await client.rpc("finish_notice_analysis_pilot_member", {
    p_pilot_run_id: pilotRunId,
    p_job_id: job.id,
    p_worker_id: workerId,
    p_member_status: memberStatus,
  });
  if (error) throw new Error(`finish_notice_analysis_pilot_member_failed:${error.message}`);
  return data;
}

export async function reservePilotCostViaRpc(
  client, workerId, pilotRunId, job, role, estimatedCostMicros,
) {
  const { data, error } = await client.rpc("reserve_notice_analysis_pilot_cost", {
    p_pilot_run_id: pilotRunId,
    p_job_id: job.id,
    p_worker_id: workerId,
    p_attempt_number: Number(job.attempt_count),
    p_run_role: role,
    p_estimated_cost_micros: Number(estimatedCostMicros),
  });
  if (error) throw new Error(`pilot_cost_reservation_failed:${error.message}`);
  return data;
}
