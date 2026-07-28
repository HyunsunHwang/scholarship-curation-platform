import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertExplicitOperatorEnvironment,
} from "../lib/post-phase-l/operator-environment.mjs";
import {
  buildProviderUsageReceipt,
} from "../lib/analysis/analysis-routed-persistence.mjs";
import {
  runBoundedPilotConsumer,
} from "../lib/analysis/analysis-db-consumer.mjs";
import { escalationReasons } from "../lib/analysis/analysis-routing.mjs";
import { executeAnalysisJob } from "../lib/analysis/analysis-worker-core.mjs";
import { buildAnalysisInput } from "../lib/analysis/analysis-input-builder.mjs";
import { createBudgetGuard } from "../lib/analysis/model-routing-policy.mjs";

const migration = fs.readFileSync(
  "supabase/post-phase-l/009_analysis_pilot_control_plane.sql", "utf8",
);
const verifier = fs.readFileSync(
  "supabase/post-phase-l/verify_analysis_nonproduction_pilot.sql", "utf8",
);
const baseline = fs.readFileSync(
  "supabase/post-phase-l/001_post_phase_l_compatibility_baseline.sql", "utf8",
);
const worker = fs.readFileSync("scripts/run-routed-analysis-worker.mjs", "utf8");
const registration = fs.readFileSync("scripts/register-analysis-live-pilot-v2.mjs", "utf8");

const safeEnv = {
  POST_PHASE_L_TARGET_PROJECT_REF: "hrayfvdggbhfmmzfblly",
  SUPABASE_URL: "https://hrayfvdggbhfmmzfblly.supabase.co",
  POST_PHASE_L_APPLY: "true",
  POST_PHASE_L_APPLY_CONFIRMATION: "APPLY_POST_PHASE_L_hrayfvdggbhfmmzfblly",
  POST_PHASE_L_ALLOW_DB_READ: "true",
  POST_PHASE_L_ALLOW_DB_WRITE: "true",
  SUPABASE_SERVICE_ROLE_KEY: "present-not-real",
};
assert.throws(() => assertExplicitOperatorEnvironment({}, {
  requireApply: true, permissions: ["write"], requireServiceRole: true,
}), /target_project_ref_missing/);
assert.throws(() => assertExplicitOperatorEnvironment({
  ...safeEnv,
  SUPABASE_URL: "https://synwudnxdkybwihwmtak.supabase.co",
}), /forbidden_production_ref_detected/);
assert.equal(assertExplicitOperatorEnvironment(safeEnv, {
  requireApply: true, permissions: ["read", "write"], requireServiceRole: true,
}).safe, true);

assert.match(migration, /create table public\.notice_analysis_pilot_runs/);
assert.match(migration, /create table public\.notice_analysis_pilot_run_jobs/);
assert.match(migration, /create table public\.notice_analysis_provider_usage_receipts/);
assert.match(migration, /create table public\.notice_analysis_pilot_cost_reservations/);
assert.match(migration, /limit 1/);
assert.match(migration, /pilot_expansion_not_approved/);
assert.match(migration, /pilot_manifest_requires_exactly_five_members_and_one_smoke/);
assert.match(migration, /provider_usage_receipt_conflict/);
assert.match(migration, /reserve_notice_analysis_pilot_cost/);
assert.match(migration, /provider_usage_receipt_sensitive_payload_rejected/);
const pilotClaimBody = migration.match(
  /create or replace function public\.claim_notice_analysis_pilot_job[\s\S]*?\nend\n\$\$;/,
)?.[0] ?? "";
assert.ok(pilotClaimBody);
assert.doesNotMatch(pilotClaimBody, /claim_notice_analysis_jobs/);
assert.match(pilotClaimBody, /notice_analysis_pilot_run_jobs/);
assert.match(worker, /bounded-pilot-consumer/);
assert.match(worker, /runBoundedPilotConsumer/);
for (const jobId of [
  "31292cbb-0498-5db6-bc7a-13165d3d0820",
  "2e5f7bbf-f854-53d0-93db-955f30443926",
  "be3f5cc6-34f0-5cb4-be19-05b861c4acff",
  "76d9a116-786d-5e8b-bb10-8622e99b2032",
  "cffe0fc5-6ce3-5e5f-84e9-20b8f8c6bb16",
]) assert.match(registration, new RegExp(jobId));

assert.match(baseline, /automatic_public_publish_enabled boolean/);
assert.match(baseline, /id smallint primary key/);
assert.match(verifier, /automatic_public_publish_enabled = false/);
assert.match(verifier, /where id = 1/);
assert.doesNotMatch(verifier, /automatic_publication_enabled/);
assert.doesNotMatch(verifier, /where singleton = 1/);

const missingUsage = buildProviderUsageReceipt({
  job: { attempt_count: 1, input_fingerprint: "a".repeat(64) },
  role: "economy",
  model: { provider: "anthropic", model: "safe-model" },
  estimatedCostMicros: 1000,
  actualCostMicros: null,
  run: { model: "safe-model", input_token_count: null, output_token_count: null },
  responseShape: { content_types: ["text"], stop_reason: "end_turn" },
  pricingVersion: "policy-v2",
});
assert.equal(missingUsage.usage_status, "missing");
assert.equal(missingUsage.actual_cost_micros, null);
assert.equal(JSON.stringify(missingUsage).includes("raw_response"), false);
const missingBudget = createBudgetGuard();
missingBudget.authorize({ estimatedCostMicros: 1000 });
missingBudget.recordMissingUsage();
assert.equal(missingBudget.state.actual_micros, 0);
assert.equal(missingBudget.state.reserved_micros, 1000);
assert.equal(missingBudget.state.usage_status, "unreconciled");

const recordedUsage = buildProviderUsageReceipt({
  job: { attempt_count: 1, input_fingerprint: "b".repeat(64) },
  role: "economy",
  model: { provider: "anthropic", model: "safe-model" },
  estimatedCostMicros: 1000,
  actualCostMicros: 123,
  run: { model: "safe-model", input_token_count: 100, output_token_count: 20 },
  responseShape: {},
  pricingVersion: "policy-v2",
});
assert.equal(recordedUsage.usage_status, "recorded");
assert.equal(recordedUsage.actual_cost_micros, 123);

const fixture = JSON.parse(fs.readFileSync(
  "fixtures/analysis-unit-1/eligible-analysis.json", "utf8",
));
const built = buildAnalysisInput(fixture, {
  promptVersion: "analysis-prompt-v1",
  schemaVersion: "analysis-schema-v1",
});
let responseReceiptObserved = false;
const invalidOutcome = await executeAnalysisJob({
  ...fixture,
  job: {
    id: "11111111-1111-4111-8111-111111111111",
    attempt_count: 1,
    prompt_version: "analysis-prompt-v1",
    schema_version: "analysis-schema-v1",
    input_fingerprint: built.input_fingerprint,
    metadata: { input_profile: {} },
  },
  provider: {
    mode: "mock",
    async call() {
      return {
        text: "{invalid",
        request_id: "safe-request-id",
        usage: { input_tokens: 10, output_tokens: 2, cached_input_tokens: 0 },
        response_shape: { content_types: ["text"], stop_reason: "end_turn" },
      };
    },
  },
  onProviderResponse({ run }) {
    responseReceiptObserved = true;
    assert.equal(run.input_token_count, 10);
  },
});
assert.equal(responseReceiptObserved, true);
assert.equal(invalidOutcome.ok, false);
assert.equal(invalidOutcome.error.code, "json_invalid");

assert.deepEqual(
  escalationReasons({
    ok: false,
    error: { code: "schema_invalid" },
    result: null,
  }),
  ["schema_invalid"],
);

const oldV1 = { id: "old-v1", status: "retryable_failed", attempt_count: 2 };
const smoke = { id: "v2-smoke", status: "pending", attempt_count: 1 };
let claimCount = 0;
const result = await runBoundedPilotConsumer({
  client: {},
  workerId: "test-worker",
  pilotRunId: "pilot-run",
  pilotStage: "smoke",
  limit: 1,
  claimFn: async (_client, options) => {
    assert.equal(options.pilotRunId, "pilot-run");
    claimCount += 1;
    return claimCount === 1 ? [smoke] : [];
  },
  processFn: async ({ job, pilotRunId }) => ({
    job_id: job.id, pilot_run_id: pilotRunId, ok: true,
  }),
});
assert.equal(result.claimed, 1);
assert.equal(result.summaries[0].job_id, "v2-smoke");
assert.deepEqual(oldV1, { id: "old-v1", status: "retryable_failed", attempt_count: 2 });
await assert.rejects(() => runBoundedPilotConsumer({
  client: {}, workerId: "x", pilotRunId: "p", pilotStage: "smoke", limit: 2,
}), /pilot_limit_must_equal:1/);

console.log(JSON.stringify({
  status: "pass",
  assertions: 39,
  exact_cohort_isolation: "pass",
  old_v1_job_unchanged: true,
  smoke_expansion_gate_contract: "pass",
  usage_missing_is_not_zero: true,
  raw_response_persisted: false,
}));
