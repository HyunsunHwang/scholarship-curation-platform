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
  const existingDecision = next.decisions.find((row) =>
    clean(row.job_id) === clean(jobRow.id)
    && clean(row.decision_fingerprint) === clean(routedOutcome.decision?.decision_fingerprint));
  if (clean(jobRow.status) === "succeeded" && existingDecision) {
    return { ok: true, reason: "replayed", state: next, job: clone(jobRow) };
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
    return { ok: false, reason: "finalize_notice_analysis_routing_rejected", state: next, errors: lineage.errors };
  }
  if (routedOutcome.economy?.run) insertRun(next, routedOutcome.economy.run);
  if (routedOutcome.escalation?.run) insertRun(next, routedOutcome.escalation.run);
  if (routedOutcome.economy?.result) insertResult(next, routedOutcome.economy.result);
  if (routedOutcome.escalation?.result) insertResult(next, routedOutcome.escalation.result);
  insertEvidence(next, routedOutcome.economy?.evidence ?? []);
  insertEvidence(next, routedOutcome.escalation?.evidence ?? []);
  const decisionExists = next.decisions.some((row) =>
    clean(row.job_id) === clean(jobRow.id) || clean(row.decision_fingerprint) === clean(routedOutcome.decision.decision_fingerprint));
  if (!decisionExists) next.decisions.push(clone(routedOutcome.decision));
  jobRow.status = "succeeded";
  jobRow.completed_at = now;
  jobRow.leased_by = null;
  jobRow.lease_expires_at = null;
  return { ok: true, reason: null, state: next, job: clone(jobRow) };
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
