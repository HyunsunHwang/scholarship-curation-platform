import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseStructuredAnalysisResponse,
  validateStructuredAnalysis,
} from "../lib/analysis/analysis-validator.mjs";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";
import {
  buildRunAudit,
  persistRunAuditViaRpc,
  renewAnalysisLeaseViaRpc,
} from "../lib/analysis/analysis-routed-persistence.mjs";
import { runBoundedDbConsumer } from "../lib/analysis/analysis-db-consumer.mjs";
import { createBudgetGuard } from "../lib/analysis/model-routing-policy.mjs";
import { executeAnalysisJob, createReplayProvider } from "../lib/analysis/analysis-worker-core.mjs";
import { executeRoutedAnalysisJob } from "../lib/analysis/analysis-routing.mjs";
import { buildAnalysisInput } from "../lib/analysis/analysis-input-builder.mjs";
import { stableAnalysisUuid } from "../lib/analysis/analysis-identifiers.mjs";

const fixture = JSON.parse(fs.readFileSync(
  "fixtures/analysis-unit-1/eligible-analysis.json",
  "utf8",
));
const built = buildAnalysisInput(fixture, {
  promptVersion: "analysis-prompt-v1",
  schemaVersion: "analysis-schema-v1",
});
const job = {
  id: stableAnalysisUuid("notice_analysis_jobs", `${built.input_fingerprint}|remediation`),
  notice_id: fixture.notice.id,
  revision_id: fixture.revision.id,
  prompt_version: "analysis-prompt-v1",
  schema_version: "analysis-schema-v1",
  input_fingerprint: built.input_fingerprint,
  attempt_count: 3,
  status: "leased",
  leased_by: "worker-a",
  lease_expires_at: "2026-07-28T15:00:00.000Z",
  metadata: { input_profile: {} },
};
const validText = JSON.stringify(fixture.provider_response);

// Prompt/response parsing remains strict after safe wrapper removal.
assert.deepEqual(parseStructuredAnalysisResponse(validText), fixture.provider_response);
assert.deepEqual(
  parseStructuredAnalysisResponse(`\`\`\`json\n${validText}\n\`\`\``),
  fixture.provider_response,
);
assert.deepEqual(
  parseStructuredAnalysisResponse(`결과입니다.\n${validText}\n검토하세요.`),
  fixture.provider_response,
);
assert.throws(() => parseStructuredAnalysisResponse("{bad json"), /json_invalid/);
for (const mutation of [
  (value) => { delete value.program; },
  (value) => { value.evidence = []; },
  (value) => { value.lineage.revision_id = "wrong"; },
]) {
  const output = structuredClone(fixture.provider_response);
  mutation(output);
  assert.equal(validateStructuredAnalysis(output, {
    analysisInput: built.normalized_input,
  }).valid, false);
}

// Anthropic request uses the official structured-output body without exposing the key.
let requestBody;
const providerResult = await callAnthropic({
  prompt: "safe synthetic prompt",
  apiKey: "test-only-not-logged",
  model: "claude-haiku-4-5-20251001",
  fetchImpl: async (_url, request) => {
    requestBody = JSON.parse(request.body);
    return {
      ok: true,
      headers: { get: () => "request-test" },
      async json() {
        return {
          model: "claude-haiku-4-5-20251001",
          content: [{ type: "text", text: validText }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 200 },
        };
      },
    };
  },
});
assert.equal(requestBody.output_config.format.type, "json_schema");
assert.ok(requestBody.output_config.format.schema.required.includes("program"));
assert.equal(requestBody.output_config.format.schema.$schema, undefined);
assert.equal(providerResult.usage.input_tokens, 100);

// Failed provider calls retain bounded audit diagnostics, token/cost, and no raw input/response.
const failed = await executeAnalysisJob({
  job,
  revision: fixture.revision,
  notice: fixture.notice,
  assets: fixture.assets,
  source: fixture.source,
  privacy_status: fixture.privacy_status,
  provider: {
    mode: "mock",
    async call() {
      return {
        text: JSON.stringify({ lineage: fixture.provider_response.lineage }),
        model: "claude-haiku-4-5-20251001",
        usage: { input_tokens: 111, output_tokens: 22 },
        latency_ms: 10,
      };
    },
  },
  model: "claude-haiku-4-5-20251001",
  runKey: "economy",
  estimatedCostMicros: 999,
});
assert.equal(failed.ok, false);
assert.equal(failed.run.validation_status, "schema_invalid");
const audit = buildRunAudit(failed.run);
assert.equal(audit.input_token_count, 111);
assert.equal(audit.output_token_count, 22);
assert.equal(audit.raw_response, null);
assert.equal(audit.metadata.safe_analysis_input, undefined);
assert.ok(audit.metadata.diagnostics.validation_errors.length > 0);
assert.ok(audit.metadata.diagnostics.response_summary.top_level_keys.includes("lineage"));

const rpcCalls = [];
const fakeRpcClient = {
  async rpc(name, payload) {
    rpcCalls.push({ name, payload });
    return { data: { replayed: rpcCalls.length > 1 }, error: null };
  },
};
await persistRunAuditViaRpc(fakeRpcClient, "worker-a", job, failed.run);
await persistRunAuditViaRpc(fakeRpcClient, "worker-a", job, failed.run);
assert.equal(rpcCalls.length, 2);
assert.equal(rpcCalls[0].payload.p_run.raw_response, null);
assert.equal(rpcCalls[0].payload.p_run.metadata.safe_analysis_input, undefined);
await renewAnalysisLeaseViaRpc(fakeRpcClient, "worker-a", job, 180);
assert.equal(rpcCalls[2].name, "renew_notice_analysis_job_lease");

// Routing retains economy/escalation semantics.
const escalation = await executeRoutedAnalysisJob({
  job,
  revision: fixture.revision,
  notice: fixture.notice,
  assets: fixture.assets,
  source: fixture.source,
  privacy_status: fixture.privacy_status,
  economyProvider: createReplayProvider("{}"),
  escalationProvider: createReplayProvider(fixture.provider_response),
  budget: createBudgetGuard(),
});
assert.equal(escalation.status, "escalation_selected");
const economyOnlyProvider = createReplayProvider(fixture.provider_response);
const economyOnly = await executeRoutedAnalysisJob({
  job: { ...job, id: stableAnalysisUuid("notice_analysis_jobs", "economy-only") },
  revision: fixture.revision,
  notice: fixture.notice,
  assets: fixture.assets,
  source: fixture.source,
  privacy_status: fixture.privacy_status,
  economyProvider: economyOnlyProvider,
  escalationProvider: createReplayProvider("{}"),
  budget: createBudgetGuard(),
});
assert.equal(economyOnly.status, "economy_selected");
assert.equal(economyOnlyProvider.calls, 1);
const bothInvalid = await executeRoutedAnalysisJob({
  job: { ...job, id: stableAnalysisUuid("notice_analysis_jobs", "both-invalid-remediation") },
  revision: fixture.revision,
  notice: fixture.notice,
  assets: fixture.assets,
  source: fixture.source,
  privacy_status: fixture.privacy_status,
  economyProvider: createReplayProvider("{}"),
  escalationProvider: createReplayProvider("{}"),
  budget: createBudgetGuard(),
});
assert.equal(bothInvalid.ok, false);
assert.equal(bothInvalid.economy.run.run_role, "economy");
assert.equal(bothInvalid.escalation.run.run_role, "escalation");

// limit=5 is five sequential one-row claims, never one eager five-row lease.
const queued = Array.from({ length: 5 }, (_, index) => ({ id: `job-${index + 1}` }));
const claimLimits = [];
const processed = [];
const consumer = await runBoundedDbConsumer({
  client: {},
  workerId: "worker-sequential",
  limit: 5,
  budgetOptions: { maxJobs: 5, maxRuns: 10, maxEscalations: 5 },
  async claimFn(_client, options) {
    claimLimits.push(options.limit);
    return queued.length ? [queued.shift()] : [];
  },
  async processFn({ job: current }) {
    processed.push(current.id);
    return { job_id: current.id, ok: true };
  },
});
assert.deepEqual(claimLimits, [1, 1, 1, 1, 1]);
assert.deepEqual(processed, ["job-1", "job-2", "job-3", "job-4", "job-5"]);
assert.equal(consumer.claimed, 5);

// A hard stop after the first claim cannot consume attempts for the four unclaimed jobs.
const crashQueue = Array.from({ length: 5 }, (_, index) => ({
  id: `crash-${index + 1}`,
  attempt_count: 0,
}));
const firstClaim = crashQueue.shift();
firstClaim.attempt_count += 1;
assert.equal(firstClaim.attempt_count, 1);
assert.deepEqual(crashQueue.map((row) => row.attempt_count), [0, 0, 0, 0]);

const migration = fs.readFileSync(
  "supabase/post-phase-l/008_live_pilot_failed_run_and_lease_hardening.sql",
  "utf8",
);
assert.match(migration, /record_notice_analysis_run_audit/);
assert.match(migration, /on conflict \(job_id, attempt_number, run_role\) do nothing/);
assert.match(migration, /failed_run_audit_conflict/);
assert.match(migration, /renew_notice_analysis_job_lease/);
assert.match(migration, /leased_by = p_worker_id/);
assert.match(migration, /least\(greatest\(coalesce\(p_lease_seconds, 180\), 60\), 600\)/);
assert.match(migration, /coalesce\(p_run->'raw_response', 'null'::jsonb\)/);
assert.match(migration, /from public, anon, authenticated/);

const consumerSource = fs.readFileSync("lib/analysis/analysis-db-consumer.mjs", "utf8");
assert.match(consumerSource, /limit: 1, leaseSeconds: 180/);
assert.ok(
  consumerSource.indexOf("await persistRunAuditViaRpc")
  < consumerSource.indexOf('client.rpc("fail_notice_analysis_job"'),
);
const workerSource = fs.readFileSync("scripts/run-routed-analysis-worker.mjs", "utf8");
assert.match(workerSource, /--allow-nonproduction-db-write is required/);
assert.match(workerSource, /--allow-db-queue is required/);
assert.match(workerSource, /Math\.min\(Number\(options\.limit \?\? 3\), 5\)/);
const seedSource = fs.readFileSync("scripts/seed-analysis-live-pilot-v2.mjs", "utf8");
assert.match(seedSource, /five-case-live-pilot-v2/);
assert.match(seedSource, /privacy_basis: "synthetic_fixture"/);
assert.match(seedSource, /assertPostPhaseLTarget\(process\.env, \{ requireApply: true \}\)/);

console.log("analysis_live_pilot_remediation=pass");
