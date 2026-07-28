import assert from "node:assert/strict";
import fs from "node:fs";
import {
  approveProgramCycleProposal,
  buildCycleIdentity,
  buildProgramIdentity,
} from "../lib/analysis/program-cycle-domain.mjs";
import {
  createBudgetGuard,
  estimateCostMicros,
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

const fixture = JSON.parse(fs.readFileSync("fixtures/analysis-unit-1/eligible-analysis.json", "utf8"));
const a = buildProgramIdentity({ canonicalName: "미래 인재 장학금", operatingOrganization: null });
const b = buildProgramIdentity({ canonicalName: "미래인재장학금", operatingOrganization: null });
assert.equal(a.identity_key, b.identity_key);
assert.equal(a.normalized_organization, "organization-unknown");
assert.notEqual(a.identity_key, buildProgramIdentity({
  canonicalName: "미래인재장학금", operatingOrganization: "다른 기관",
}).identity_key);

const cycleA = buildCycleIdentity({
  programId: "program", revisionId: "revision", cycleYear: 2026,
  academicTerm: "1학기",
});
assert.equal(cycleA.revision_identity_key, buildCycleIdentity({
  programId: "program", revisionId: "revision", cycleYear: 2027,
}).revision_identity_key);
assert.ok(cycleA.cycle_identity_key);
assert.equal(buildCycleIdentity({
  programId: "program", revisionId: "other", cycleYear: 2026,
}).cycle_identity_key, null);

const duplicateProposal = {
  id: "proposal-2", status: "pending", proposed_program: {
    canonical_name: "미래 인재 장학금", operating_organization: null,
  }, proposed_cycle: { cycle_label: "2026학년도" }, revision_id: "revision-2",
  notice_id: "notice",
};
const identityConflict = approveProgramCycleProposal({
  state: {
    programs: [{ id: "program-1", canonical_name: "미래인재장학금", operating_organization: null }],
    proposals: [duplicateProposal],
  },
  proposalId: duplicateProposal.id, decision: "approve_new_program_and_cycle",
  actorId: "admin", idempotencyKey: "identity-conflict", isAdmin: true,
});
assert.equal(identityConflict.reason, "program_identity_conflict");

assert.throws(() => resolveModelRole("economy", { modelOverride: "unknown-model" }),
  /unknown_pricing/);
assert.equal(estimateCostMicros(resolveModelRole("economy"), {
  inputTokens: 1_000_000, outputTokens: 1_000_000,
}), 4_800_000);
const denied = createBudgetGuard({ runBudgetMicros: 1 });
assert.equal(denied.authorize({ estimatedCostMicros: 2 }).allowed, false);

const built = buildAnalysisInput(fixture, {
  promptVersion: "analysis-prompt-v1", schemaVersion: "analysis-schema-v1",
});
const job = {
  id: stableAnalysisUuid("notice_analysis_jobs", built.input_fingerprint),
  notice_id: fixture.notice.id, revision_id: fixture.revision.id,
  prompt_version: "analysis-prompt-v1", schema_version: "analysis-schema-v1",
  input_fingerprint: built.input_fingerprint, attempt_count: 1, metadata: { input_profile: {} },
};
const lowConfidence = structuredClone(fixture.provider_response);
lowConfidence.program.confidence = 0.2;
const routed = await executeRoutedAnalysisJob({
  job, revision: fixture.revision, notice: fixture.notice, assets: fixture.assets,
  source: fixture.source, privacy_status: fixture.privacy_status,
  economyProvider: createReplayProvider(lowConfidence),
  escalationProvider: createReplayProvider(fixture.provider_response),
  budget: createBudgetGuard(),
});
assert.equal(routed.ok, true);
assert.equal(routed.status, "escalation_selected");
assert.notEqual(routed.economy.run.id, routed.escalation.run.id);
assert.equal(routed.decision.selected_result_id, routed.escalation.result.id);

const invalidEscalation = await executeRoutedAnalysisJob({
  job: { ...job, id: stableAnalysisUuid("notice_analysis_jobs", `${built.input_fingerprint}-2`) },
  revision: fixture.revision, notice: fixture.notice, assets: fixture.assets,
  source: fixture.source, privacy_status: fixture.privacy_status,
  economyProvider: createReplayProvider(lowConfidence),
  escalationProvider: createReplayProvider("{}"),
  budget: createBudgetGuard(),
});
assert.equal(invalidEscalation.status, "economy_retained");
assert.equal(invalidEscalation.selected.result.structured_result.program.name, "미래인재 장학금");

const gold = [{
  notice_id: fixture.notice.id, revision_id: fixture.revision.id,
  input_fingerprint: built.input_fingerprint, effective_gold_output: fixture.provider_response,
}];
const evaluation = evaluateAnalysisCandidates(gold, [{
  revision_id: fixture.revision.id, output: fixture.provider_response,
  usage: { input_tokens: 10, output_tokens: 20 }, estimated_cost_micros: 30, latency_ms: 40,
}]);
assert.equal(evaluation.fields["program.name"].exact_match, 1);
assert.equal(evaluation.totals.schema_valid, 1);
assert.equal(evaluation.totals.lineage_valid, 1);
assert.equal(evaluation.totals.input_tokens, 10);
assert.deepEqual(summarizeOperations({
  jobs: [{ status: "queued" }], runs: [routed.economy.run, routed.escalation.run],
  decisions: [routed.decision],
}).routing, { decisions: 1, escalated: 1, selected: 1, economy_retained: 0 });

const migration = fs.readFileSync(
  "supabase/post-phase-l/007_analysis_routing_and_identity_hardening.sql", "utf8",
);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /scholarship_programs_identity_key_uidx/);
assert.match(migration, /scholarship_cycles_revision_identity_uidx/);
assert.match(migration, /notice_analysis_routing_decisions/);
assert.match(migration, /revoke all .* from public, anon, authenticated/s);
console.log("analysis_unit_3=pass");
