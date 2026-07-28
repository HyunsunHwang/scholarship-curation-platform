import assert from "node:assert/strict";
import fs from "node:fs";
import {
  approveProgramCycleProposal,
  buildCycleIdentity,
  buildProgramIdentity,
} from "../lib/analysis/program-cycle-domain.mjs";
import {
  buildCycleClearCanonicalString,
  buildCycleRevisionCanonicalString,
  buildProgramIdentityCanonicalString,
  scholarshipIdentityNormalize,
} from "../lib/analysis/scholarship-identity.mjs";
import {
  createBudgetGuard,
  estimateCostMicros,
  loadModelPolicy,
  resolveModelRole,
} from "../lib/analysis/model-routing-policy.mjs";
import { executeRoutedAnalysisJob } from "../lib/analysis/analysis-routing.mjs";
import { createReplayProvider } from "../lib/analysis/analysis-worker-core.mjs";
import { buildAnalysisInput } from "../lib/analysis/analysis-input-builder.mjs";
import { stableAnalysisUuid } from "../lib/analysis/analysis-identifiers.mjs";
import {
  evaluateAnalysisCandidates,
  summarizeOperations,
} from "../lib/analysis/analysis-evaluation.mjs";
import {
  persistBaselineSuccessInMemory,
  persistRoutedSuccessInMemory,
  validateRoutingLineage,
} from "../lib/analysis/analysis-routed-persistence.mjs";
import { executeAnalysisJob } from "../lib/analysis/analysis-worker-core.mjs";

const fixture = JSON.parse(fs.readFileSync("fixtures/analysis-unit-1/eligible-analysis.json", "utf8"));
const migration007 = fs.readFileSync(
  "supabase/post-phase-l/007_analysis_routing_and_identity_hardening.sql",
  "utf8",
);

function leasedJob(inputFingerprint, suffix = "") {
  return {
    id: stableAnalysisUuid("notice_analysis_jobs", `${inputFingerprint}${suffix}`),
    notice_id: fixture.notice.id,
    revision_id: fixture.revision.id,
    prompt_version: "analysis-prompt-v1",
    schema_version: "analysis-schema-v1",
    input_fingerprint: inputFingerprint,
    attempt_count: 1,
    status: "leased",
    leased_by: "worker-a",
    lease_expires_at: "2026-07-28T06:00:00.000Z",
    metadata: { input_profile: {} },
  };
}

const built = buildAnalysisInput(fixture, {
  promptVersion: "analysis-prompt-v1",
  schemaVersion: "analysis-schema-v1",
});
const baseJob = leasedJob(built.input_fingerprint);

// Test 1 — Active model policy
{
  const policy = loadModelPolicy();
  const serialized = JSON.stringify(policy);
  assert.doesNotMatch(serialized, /claude-3-5-haiku-20241022/);
  assert.doesNotMatch(serialized, /claude-sonnet-4-20250514/);
  for (const role of ["economy", "baseline", "escalation"]) {
    const resolved = resolveModelRole(role);
    assert.ok(resolved.model);
    assert.ok(resolved.input_micros_per_million_tokens > 0);
    assert.ok(resolved.output_micros_per_million_tokens > 0);
  }
  assert.throws(() => resolveModelRole("economy", { modelOverride: "unknown-model" }), /unknown_pricing/);
  assert.equal(estimateCostMicros(resolveModelRole("economy"), {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  }), 6_000_000);
}

// Test 2 — JS/SQL identity parity
{
  const programCanonical = buildProgramIdentityCanonicalString({
    canonicalName: "미래 인재 장학금",
    operatingOrganization: null,
    discriminator: "default",
  });
  assert.match(programCanonical, /^v1\|program\|/);
  assert.equal(
    buildProgramIdentity({ canonicalName: "미래 인재 장학금", operatingOrganization: null }).identity_key,
    buildProgramIdentity({ canonicalName: "미래인재장학금", operatingOrganization: null }).identity_key,
  );
  assert.equal(
    buildProgramIdentity({ canonicalName: "미래인재장학금", operatingOrganization: null }).normalized_organization,
    "organization-unknown",
  );
  assert.notEqual(
    buildProgramIdentity({ canonicalName: "미래인재장학금", operatingOrganization: "다른 기관" }).identity_key,
    buildProgramIdentity({ canonicalName: "미래인재장학금", operatingOrganization: null }).identity_key,
  );
  const revisionCanonical = buildCycleRevisionCanonicalString({
    programId: "program",
    revisionId: "revision",
  });
  assert.equal(revisionCanonical, "v1|cycle-revision|program|revision");
  const clearCanonical = buildCycleClearCanonicalString({
    programId: "program",
    cycleYear: 2026,
    academicTerm: "1학기",
    applicationStartAt: "2026-03-01",
    applicationEndAt: "2026-03-31",
  });
  assert.match(clearCanonical, /^v1\|cycle-clear\|program\|2026\|/);
  assert.match(migration007, /'v1\|program\|'/);
  assert.match(migration007, /'v1\|cycle-revision\|'/);
  assert.match(migration007, /'v1\|cycle-clear\|'/);
  assert.equal(scholarshipIdentityNormalize(" A-B/C "), scholarshipIdentityNormalize("abc"));
}

// Test 3 — Baseline regression with run_role uniqueness contract
{
  const baseline = await executeAnalysisJob({
    job: { ...baseJob, attempt_count: 1 },
    revision: fixture.revision,
    notice: fixture.notice,
    assets: fixture.assets,
    source: fixture.source,
    privacy_status: fixture.privacy_status,
    provider: createReplayProvider(fixture.provider_response),
    runKey: "default",
  });
  assert.equal(baseline.ok, true);
  assert.equal(baseline.run.run_role, "baseline");
  const persisted = persistBaselineSuccessInMemory({
    state: { jobs: [baseJob], runs: [], results: [], evidence: [] },
    job: baseJob,
    workerId: "worker-a",
    outcome: baseline,
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(persisted.ok, true);
  assert.match(migration007, /on conflict \(job_id, attempt_number, run_role\)/);
  assert.match(migration007, /finalize_notice_analysis_success/);
}

// Test 4 — Economy selected
{
  const routed = await executeRoutedAnalysisJob({
    job: baseJob,
    revision: fixture.revision,
    notice: fixture.notice,
    assets: fixture.assets,
    source: fixture.source,
    privacy_status: fixture.privacy_status,
    economyProvider: createReplayProvider(fixture.provider_response),
    escalationProvider: createReplayProvider(fixture.provider_response),
    budget: createBudgetGuard(),
  });
  assert.equal(routed.status, "economy_selected");
  const persisted = persistRoutedSuccessInMemory({
    state: { jobs: [baseJob], runs: [], results: [], evidence: [], decisions: [] },
    job: baseJob,
    workerId: "worker-a",
    routedOutcome: routed,
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(persisted.ok, true);
  assert.equal(persisted.state.decisions.length, 1);
  assert.equal(persisted.state.runs.length, 1);
  assert.equal(persisted.state.runs[0].run_role, "economy");
}

// Test 5 — Escalation selected
{
  const lowConfidence = structuredClone(fixture.provider_response);
  lowConfidence.program.confidence = 0.2;
  const routed = await executeRoutedAnalysisJob({
    job: leasedJob(built.input_fingerprint, "-escalation"),
    revision: fixture.revision,
    notice: fixture.notice,
    assets: fixture.assets,
    source: fixture.source,
    privacy_status: fixture.privacy_status,
    economyProvider: createReplayProvider(lowConfidence),
    escalationProvider: createReplayProvider(fixture.provider_response),
    budget: createBudgetGuard(),
  });
  assert.equal(routed.status, "escalation_selected");
  assert.notEqual(routed.economy.run.id, routed.escalation.run.id);
  assert.equal(routed.decision.selected_result_id, routed.escalation.result.id);
}

// Test 6 — Economy retained
{
  const lowConfidence = structuredClone(fixture.provider_response);
  lowConfidence.program.confidence = 0.2;
  const job = leasedJob(built.input_fingerprint, "-retained");
  const routed = await executeRoutedAnalysisJob({
    job,
    revision: fixture.revision,
    notice: fixture.notice,
    assets: fixture.assets,
    source: fixture.source,
    privacy_status: fixture.privacy_status,
    economyProvider: createReplayProvider(lowConfidence),
    escalationProvider: createReplayProvider("{}"),
    budget: createBudgetGuard(),
  });
  assert.equal(routed.status, "economy_retained");
  assert.equal(routed.selected.result.structured_result.program.name, "미래인재 장학금");
  const persisted = persistRoutedSuccessInMemory({
    state: { jobs: [job], runs: [], results: [], evidence: [], decisions: [] },
    job,
    workerId: "worker-a",
    routedOutcome: routed,
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(persisted.ok, true);
  assert.equal(persisted.state.runs.length, 2);
}

// Test 7 — Both invalid
{
  const invalid = await executeRoutedAnalysisJob({
    job: leasedJob(built.input_fingerprint, "-both-invalid"),
    revision: fixture.revision,
    notice: fixture.notice,
    assets: fixture.assets,
    source: fixture.source,
    privacy_status: fixture.privacy_status,
    economyProvider: createReplayProvider("{}"),
    escalationProvider: createReplayProvider("{}"),
    budget: createBudgetGuard(),
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.selected, null);
  const persisted = persistRoutedSuccessInMemory({
    state: { jobs: [baseJob], runs: [], results: [], evidence: [], decisions: [] },
    job: baseJob,
    workerId: "worker-a",
    routedOutcome: invalid,
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(persisted.ok, false);
}

// Test 8 — Lease and replay idempotency
{
  const routed = await executeRoutedAnalysisJob({
    job: baseJob,
    revision: fixture.revision,
    notice: fixture.notice,
    assets: fixture.assets,
    source: fixture.source,
    privacy_status: fixture.privacy_status,
    economyProvider: createReplayProvider(fixture.provider_response),
    escalationProvider: createReplayProvider(fixture.provider_response),
    budget: createBudgetGuard(),
  });
  const first = persistRoutedSuccessInMemory({
    state: { jobs: [baseJob], runs: [], results: [], evidence: [], decisions: [] },
    job: baseJob,
    workerId: "worker-a",
    routedOutcome: routed,
    now: "2026-07-28T05:30:00.000Z",
  });
  const replay = persistRoutedSuccessInMemory({
    state: first.state,
    job: baseJob,
    workerId: "worker-a",
    routedOutcome: routed,
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.state.runs.length, 1);
  assert.equal(replay.state.decisions.length, 1);
  const wrongWorker = persistRoutedSuccessInMemory({
    state: { jobs: [baseJob], runs: [], results: [], evidence: [], decisions: [] },
    job: baseJob,
    workerId: "worker-b",
    routedOutcome: routed,
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(wrongWorker.ok, false);
  assert.equal(wrongWorker.reason, "lease_owner_mismatch");
  assert.equal(validateRoutingLineage({
    job: baseJob,
    economy: routed.economy,
    escalation: routed.escalation,
    decision: routed.decision,
    selected: routed.selected,
  }).ok, true);
}

// Test 9 — Budget
{
  const denied = createBudgetGuard({ runBudgetMicros: 1 });
  assert.equal(denied.authorize({ estimatedCostMicros: 2 }).allowed, false);
  const budget = createBudgetGuard({ dailyBudgetMicros: 10_000_000 });
  const auth = budget.authorize({ estimatedCostMicros: 1000 });
  budget.recordActual({ estimatedCostMicros: 1000, actualCostMicros: 1200 });
  assert.equal(auth.allowed, true);
  assert.equal(budget.state.actual_micros, 1200);
  assert.equal(budget.state.reserved_micros, 1200);
}

// Test 10 — Evidence evaluation
{
  const builtInput = buildAnalysisInput(fixture, {
    promptVersion: "analysis-prompt-v1",
    schemaVersion: "analysis-schema-v1",
  });
  const gold = [{
    notice_id: fixture.notice.id,
    revision_id: fixture.revision.id,
    input_fingerprint: built.input_fingerprint,
    effective_gold_output: fixture.provider_response,
  }];
  const evaluation = evaluateAnalysisCandidates(gold, [{
    revision_id: fixture.revision.id,
    output: fixture.provider_response,
    analysis_input: builtInput.normalized_input,
    usage: { input_tokens: 10, output_tokens: 20 },
    estimated_cost_micros: 30,
    actual_cost_micros: 35,
    latency_ms: 40,
  }]);
  assert.equal(evaluation.fields["program.name"].exact_match, 1);
  assert.equal(evaluation.totals.schema_valid, 1);
  assert.equal(evaluation.totals.evidence_valid, 1);
  assert.equal(evaluation.totals.evidence_invalid, 0);
  assert.equal(evaluation.totals.evidence_validation_rate, 1);
  assert.equal(evaluation.totals.lineage_valid, 1);
  assert.equal(evaluation.totals.actual_cost_micros, 35);
  assert.deepEqual(summarizeOperations({
    jobs: [{ status: "queued" }],
    runs: [],
    decisions: [],
  }).routing, { decisions: 0, escalated: 0, selected: 0, economy_retained: 0 });
}

// Program identity conflict + migration contracts
{
  const duplicateProposal = {
    id: "proposal-2",
    status: "pending",
    proposed_program: { canonical_name: "미래 인재 장학금", operating_organization: null },
    proposed_cycle: { cycle_label: "2026학년도" },
    revision_id: "revision-2",
    notice_id: "notice",
  };
  const identityConflict = approveProgramCycleProposal({
    state: {
      programs: [{ id: "program-1", canonical_name: "미래인재장학금", operating_organization: null }],
      proposals: [duplicateProposal],
    },
    proposalId: duplicateProposal.id,
    decision: "approve_new_program_and_cycle",
    actorId: "admin",
    idempotencyKey: "identity-conflict",
    isAdmin: true,
  });
  assert.equal(identityConflict.reason, "program_identity_conflict");
  assert.match(migration007, /finalize_notice_analysis_routing/);
  assert.match(migration007, /pg_advisory_xact_lock/);
  assert.match(migration007, /run\.status = 'succeeded'/);
  assert.match(migration007, /run\.validation_status = 'validated'/);
  assert.match(migration007, /run\.finished_at is not null/);
}

console.log("analysis_unit_3=pass");
