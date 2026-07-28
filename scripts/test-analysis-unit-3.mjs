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
  deferJobForBudgetInMemory,
  persistBaselineSuccessInMemory,
  persistRoutedSuccessInMemory,
  validateRoutingLineage,
} from "../lib/analysis/analysis-routed-persistence.mjs";
import {
  runBoundedDbConsumer,
  validateBoundedDbConsumerPreflight,
} from "../lib/analysis/analysis-db-consumer.mjs";
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
  assert.equal(replay.replayed, true);
  assert.equal(replay.result?.replayed, true);
  assert.equal(replay.result?.status, "succeeded");
  assert.equal(replay.state.runs.length, 1);
  assert.equal(replay.state.decisions.length, 1);
  assert.equal(replay.state.results.length, 1);
  assert.equal(replay.state.evidence.length, first.state.evidence.length);
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

// Test 8b — Replay conflict
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
  const conflict = persistRoutedSuccessInMemory({
    state: first.state,
    job: { ...baseJob, status: "succeeded", leased_by: null, lease_expires_at: null },
    workerId: "worker-a",
    routedOutcome: {
      ...routed,
      decision: { ...routed.decision, decision_fingerprint: "a".repeat(64) },
    },
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "routing_decision_conflict");
}

// Test 8c — SQL routed replay contract order
{
  const fnStart = migration007.indexOf("create or replace function public.finalize_notice_analysis_routing");
  const fnBody = migration007.slice(fnStart);
  const decisionLookup = fnBody.indexOf("from public.notice_analysis_routing_decisions");
  const replayReturn = fnBody.indexOf("'replayed', true");
  const leaseReject = fnBody.indexOf("finalize_notice_analysis_routing_rejected_lease");
  assert.ok(decisionLookup >= 0);
  assert.ok(replayReturn >= 0);
  assert.ok(leaseReject >= 0);
  assert.ok(decisionLookup < leaseReject);
  assert.ok(replayReturn < leaseReject);
  assert.match(migration007, /routing_decision_conflict/);
  assert.match(migration007, /defer_notice_analysis_job_for_budget/);
  assert.match(migration007, /status = 'budget_deferred'/);
}

// Test 8d — Budget defer transition
{
  const job = leasedJob(built.input_fingerprint, "-budget");
  const deferred = deferJobForBudgetInMemory({
    state: { jobs: [job] },
    job,
    workerId: "worker-a",
    reasonCodes: ["daily_budget_exceeded"],
    estimatedCostMicros: 999,
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(deferred.ok, true);
  assert.equal(deferred.job.status, "budget_deferred");
  assert.equal(deferred.job.last_error_code, "budget_deferred");
  assert.equal(deferred.job.leased_by, null);
  assert.equal(deferred.job.lease_expires_at, null);
  assert.equal(deferred.job.completed_at, null);
  const replay = deferJobForBudgetInMemory({
    state: deferred.state,
    job: deferred.job,
    workerId: "worker-a",
    now: "2026-07-28T05:30:00.000Z",
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
}

// Test 8e — Budget defer lease safety
{
  const job = leasedJob(built.input_fingerprint, "-budget-lease");
  assert.equal(deferJobForBudgetInMemory({
    state: { jobs: [job] },
    job,
    workerId: "worker-b",
    now: "2026-07-28T05:30:00.000Z",
  }).reason, "lease_owner_mismatch");
  const expired = {
    ...leasedJob(built.input_fingerprint, "-budget-expired"),
    lease_expires_at: "2026-07-28T04:00:00.000Z",
  };
  assert.equal(deferJobForBudgetInMemory({
    state: { jobs: [expired] },
    job: expired,
    workerId: "worker-a",
    now: "2026-07-28T05:30:00.000Z",
  }).reason, "lease_expired");
  const succeeded = {
    ...leasedJob(built.input_fingerprint, "-budget-succeeded"),
    status: "succeeded",
  };
  assert.equal(deferJobForBudgetInMemory({
    state: { jobs: [succeeded] },
    job: succeeded,
    workerId: "worker-a",
    now: "2026-07-28T05:30:00.000Z",
  }).reason, "invalid_status");
}

// Test 8f — DB consumer preflight guard
{
  assert.throws(
    () => validateBoundedDbConsumerPreflight({ live: false, fixturePath: null }),
    /bounded_db_consumer_requires_live_provider_or_fixture/,
  );
  assert.throws(
    () => validateBoundedDbConsumerPreflight({ live: false, fixturePath: "missing-fixture.json" }),
    /fixture_not_found/,
  );
  fs.mkdirSync("fixtures/analysis-unit-3", { recursive: true });
  const invalidFixture = "fixtures/analysis-unit-3/invalid-fixture.json";
  fs.writeFileSync(invalidFixture, "{not-json");
  assert.throws(
    () => validateBoundedDbConsumerPreflight({ live: false, fixturePath: invalidFixture }),
    /fixture_invalid_json/,
  );
  fs.writeFileSync(invalidFixture, JSON.stringify({ notice: {} }));
  assert.throws(
    () => validateBoundedDbConsumerPreflight({ live: false, fixturePath: invalidFixture }),
    /fixture_missing_provider_response/,
  );
  fs.unlinkSync(invalidFixture);
  const prevKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.throws(
    () => validateBoundedDbConsumerPreflight({ live: true, fixturePath: null }),
    /provider_credentials_missing/,
  );
  process.env.ANTHROPIC_API_KEY = prevKey ?? "test-key";
  validateBoundedDbConsumerPreflight({
    live: false,
    fixturePath: "fixtures/analysis-unit-1/eligible-analysis.json",
  });
}

// Test 8g — Valid fixture consumer preflight
{
  const preflight = validateBoundedDbConsumerPreflight({
    live: false,
    fixturePath: "fixtures/analysis-unit-1/eligible-analysis.json",
  });
  assert.equal(preflight.mode, "fixture");
  assert.ok(preflight.replayResponse);
  let claimCalls = 0;
  const mockClient = {
    rpc: (name) => {
      if (name === "claim_notice_analysis_jobs") claimCalls += 1;
      return Promise.resolve({ data: [], error: null });
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { message: "skip" } }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  };
  await runBoundedDbConsumer({
    client: mockClient,
    workerId: "worker-a",
    limit: 1,
    live: false,
    replayResponse: preflight.replayResponse,
    claimFn: async () => {
      claimCalls += 1;
      return [];
    },
  });
  assert.equal(claimCalls, 1);
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
