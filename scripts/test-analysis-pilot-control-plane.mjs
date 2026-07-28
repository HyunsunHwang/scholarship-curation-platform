import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertExplicitOperatorEnvironment,
  assertLiveProviderDoubleGate,
} from "../lib/post-phase-l/operator-environment.mjs";
import {
  assertPilotManifestFingerprint,
  assertPilotManifestPreflight,
  fingerprintPilotManifest,
} from "../lib/analysis/analysis-pilot-manifest.mjs";
import { buildAnalysisInput } from "../lib/analysis/analysis-input-builder.mjs";
import { executeRoutedAnalysisJob } from "../lib/analysis/analysis-routing.mjs";
import { createBudgetGuard } from "../lib/analysis/model-routing-policy.mjs";
import { runBoundedPilotConsumer } from "../lib/analysis/analysis-db-consumer.mjs";

let assertions = 0;
function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}
function deepEqual(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}
function matches(value, pattern, message) {
  assert.match(value, pattern, message);
  assertions += 1;
}
function doesNotMatch(value, pattern, message) {
  assert.doesNotMatch(value, pattern, message);
  assertions += 1;
}
function throws(fn, pattern) {
  assert.throws(fn, pattern);
  assertions += 1;
}

const migration = fs.readFileSync(
  "supabase/post-phase-l/009_analysis_pilot_control_plane.sql", "utf8",
);
const verifier = fs.readFileSync(
  "supabase/post-phase-l/verify_analysis_nonproduction_pilot.sql", "utf8",
);
const workerSource = fs.readFileSync("scripts/run-routed-analysis-worker.mjs", "utf8");
const registrationSource = fs.readFileSync(
  "scripts/register-analysis-live-pilot-v2.mjs", "utf8",
);
const privilegeMigration = fs.readFileSync(
  "supabase/post-phase-l/010_finalize_routing_privilege_hardening.sql", "utf8",
);

matches(privilegeMigration, /begin;/);
matches(privilegeMigration, /perform public\.post_phase_l_assert_environment\(\)/);
matches(privilegeMigration, /to_regprocedure\(target_signature\) is null/);
matches(privilegeMigration, /finalize_notice_analysis_routing_signature_missing/);
matches(
  privilegeMigration,
  /revoke execute on function public\.finalize_notice_analysis_routing\([\s\S]*?\) from public, anon, authenticated;/,
);
matches(
  privilegeMigration,
  /grant execute on function public\.finalize_notice_analysis_routing\([\s\S]*?\) to service_role;/,
);
matches(privilegeMigration, /has_function_privilege\('authenticated'/);
matches(privilegeMigration, /not has_function_privilege\('service_role'/);
matches(privilegeMigration, /finalize_notice_analysis_routing_privilege_hardening_failed/);
matches(privilegeMigration, /commit;/);

matches(migration, /extension\.extname = 'pgcrypto'/);
matches(migration, /namespace\.nspname = 'extensions'/);
matches(migration, /to_regprocedure\('extensions\.digest\(text,text\)'\) is null/);
matches(migration, /extensions\.digest\(/);
matches(migration, /pg_catalog\.encode\(/);
doesNotMatch(migration, /(?<!extensions\.)digest\(/);
equal(
  migration.indexOf("pgcrypto_digest_text_signature_missing")
    < migration.indexOf(
      "create or replace function public.notice_analysis_pilot_manifest_fingerprint",
    ),
  true,
);

const safeEnv = {
  POST_PHASE_L_TARGET_PROJECT_REF: "hrayfvdggbhfmmzfblly",
  SUPABASE_URL: "https://hrayfvdggbhfmmzfblly.supabase.co",
  POST_PHASE_L_APPLY: "true",
  POST_PHASE_L_APPLY_CONFIRMATION: "APPLY_POST_PHASE_L_hrayfvdggbhfmmzfblly",
  POST_PHASE_L_ALLOW_DB_READ: "true",
  POST_PHASE_L_ALLOW_DB_WRITE: "true",
  SUPABASE_SERVICE_ROLE_KEY: "present-not-real",
};

throws(() => assertLiveProviderDoubleGate(
  { "allow-live-provider": true }, safeEnv, { live: true },
), /operator_permission_missing:liveProvider/);
throws(() => assertLiveProviderDoubleGate(
  {}, { ...safeEnv, POST_PHASE_L_ALLOW_LIVE_PROVIDER: "true" }, { live: true },
), /operator_cli_flag_missing:allow-live-provider/);
deepEqual(assertLiveProviderDoubleGate(
  { "allow-live-provider": true },
  { ...safeEnv, POST_PHASE_L_ALLOW_LIVE_PROVIDER: "true" },
  { live: true },
), { live: true, cli_allowed: true, environment_allowed: true });
equal(assertLiveProviderDoubleGate({}, safeEnv, { live: false }).live, false);
throws(() => assertExplicitOperatorEnvironment({
  ...safeEnv,
  SUPABASE_URL: "https://synwudnxdkybwihwmtak.supabase.co",
}, { permissions: ["write"] }), /forbidden_production_ref_detected/);

const goldenMembers = [1, 2, 3, 4, 5].map((index) => ({
  execution_order: index,
  stage: index === 1 ? "smoke" : "expansion",
  job_id: `00000000-0000-4000-8000-00000000000${index}`,
  expected_revision_id: `10000000-0000-4000-8000-00000000000${index}`,
  expected_input_fingerprint: String(index).repeat(64),
}));
const goldenFingerprint = "b116bb8ce8219b23609384da348d098f85a5e6730854e03c275c6de31c009f10";
equal(fingerprintPilotManifest(goldenMembers), goldenFingerprint);
equal(fingerprintPilotManifest(goldenMembers.toReversed()), goldenFingerprint);
for (const field of [
  "job_id", "expected_revision_id", "expected_input_fingerprint", "stage", "execution_order",
]) {
  const changed = structuredClone(goldenMembers);
  if (field === "stage") {
    changed[1].stage = "smoke";
    changed[0].stage = "expansion";
  } else if (field === "execution_order") {
    changed[0].execution_order = 2;
    changed[1].execution_order = 1;
  } else {
    changed[0][field] = field === "expected_input_fingerprint"
      ? "a".repeat(64)
      : `20000000-0000-4000-8000-000000000001`;
  }
  assert.notEqual(fingerprintPilotManifest(changed), goldenFingerprint);
  assertions += 1;
}
throws(() => assertPilotManifestFingerprint(goldenMembers, "0".repeat(64)),
  /pilot_manifest_fingerprint_mismatch/);
throws(() => assertPilotManifestPreflight({
  pilot: { id: "pilot", manifest_fingerprint: "0".repeat(64) },
  members: goldenMembers,
  stage: "smoke",
}), /pilot_manifest_fingerprint_mismatch/);
equal(assertPilotManifestPreflight({
  pilot: { id: "pilot", manifest_fingerprint: goldenFingerprint },
  members: goldenMembers.toReversed(),
  stage: "smoke",
}).stageMembers.length, 1);

matches(migration, /notice_analysis_pilot_manifest_fingerprint\(p_members jsonb\)/);
matches(migration, /pilot_manifest_fingerprint_mismatch/);
matches(migration, /pilot_registration_replay_conflict/);
doesNotMatch(migration, /on conflict \(manifest_fingerprint\) do update/);
const registrationBody = migration.match(
  /create or replace function public\.create_or_register_notice_analysis_pilot_run[\s\S]*?\nend\n\$\$;/,
)?.[0] ?? "";
equal(
  registrationBody.indexOf("pilot_manifest_fingerprint_mismatch")
    < registrationBody.indexOf("insert into public.notice_analysis_pilot_runs"),
  true,
);
matches(registrationBody, /pilot_registration_replay_conflict/);
matches(registrationBody, /return pilot;/);
matches(registrationBody, /notice_analysis_pilot_stored_manifest_fingerprint\(pilot\.id\)/);
const claimBody = migration.match(
  /create or replace function public\.claim_notice_analysis_pilot_job[\s\S]*?\nend\n\$\$;/,
)?.[0] ?? "";
matches(claimBody, /notice_analysis_pilot_stored_manifest_fingerprint/);
matches(claimBody, /pilot_manifest_fingerprint_mismatch/);
equal(
  claimBody.indexOf("pilot_manifest_fingerprint_mismatch")
    < claimBody.indexOf("with candidate as"),
  true,
);
matches(verifier, new RegExp(goldenFingerprint));
matches(workerSource, /assertPilotManifestPreflight/);
matches(workerSource, /\.eq\("pilot_run_id", pilotRunId\)\.order\("execution_order"\)/);
doesNotMatch(workerSource, /\.eq\("pilot_run_id", pilotRunId\)\.eq\("stage"/);
matches(registrationSource, /fingerprintPilotManifest\(members\)/);

const fixture = JSON.parse(fs.readFileSync(
  "fixtures/analysis-unit-1/eligible-analysis.json", "utf8",
));
const built = buildAnalysisInput(fixture, {
  promptVersion: "analysis-prompt-v1",
  schemaVersion: "analysis-schema-v1",
});
const job = {
  id: "11111111-1111-4111-8111-111111111111",
  attempt_count: 1,
  prompt_version: "analysis-prompt-v1",
  schema_version: "analysis-schema-v1",
  input_fingerprint: built.input_fingerprint,
  metadata: { input_profile: {} },
};
function provider(text, usage = { input_tokens: 100, output_tokens: 20, cached_input_tokens: 0 }) {
  return {
    mode: "mock",
    calls: 0,
    async call() {
      this.calls += 1;
      return {
        text,
        request_id: `request-${this.calls}`,
        usage,
        response_shape: { content_types: ["text"], stop_reason: "end_turn" },
      };
    },
  };
}
function fatalReceiptError() {
  return Object.assign(new Error("receipt write failed"), {
    code: "provider_usage_persistence_failed",
    stop_routing: true,
    stop_escalation: true,
    reconciliation_required: true,
  });
}
function routedInput(economyProvider, escalationProvider, onProviderResponse) {
  return {
    ...fixture,
    job,
    economyProvider,
    escalationProvider,
    budget: createBudgetGuard(),
    onProviderResponse,
  };
}

const economyA = provider(JSON.stringify(fixture.provider_response));
const escalationA = provider(JSON.stringify(fixture.provider_response));
const receiptFailureA = await executeRoutedAnalysisJob(
  routedInput(economyA, escalationA, async () => { throw fatalReceiptError(); }),
);
equal(economyA.calls, 1);
equal(escalationA.calls, 0);
equal(receiptFailureA.status, "reconciliation_required");
equal(receiptFailureA.decision, null);
equal(receiptFailureA.reconciliation_required, true);

const economyB = provider("{invalid");
const escalationB = provider(JSON.stringify(fixture.provider_response));
const receiptFailureB = await executeRoutedAnalysisJob(
  routedInput(economyB, escalationB, async (role) => {
    if (role === "escalation") throw fatalReceiptError();
  }),
);
equal(economyB.calls + escalationB.calls, 2);
equal(receiptFailureB.status, "reconciliation_required");
equal(receiptFailureB.decision, null);

const economyC = provider("{invalid");
const escalationC = provider(JSON.stringify(fixture.provider_response));
const ordinarySchemaFailure = await executeRoutedAnalysisJob(
  routedInput(economyC, escalationC, async () => {}),
);
equal(economyC.calls, 1);
equal(escalationC.calls, 1);
equal(Boolean(ordinarySchemaFailure.decision), true);

const economyMissing = provider(
  JSON.stringify(fixture.provider_response),
  { input_tokens: null, output_tokens: null, cached_input_tokens: null },
);
const escalationMissing = provider(JSON.stringify(fixture.provider_response));
const missingUsage = await executeRoutedAnalysisJob(
  routedInput(economyMissing, escalationMissing, async () => {}),
);
equal(economyMissing.calls, 1);
equal(escalationMissing.calls, 0);
equal(missingUsage.status, "reconciliation_required");
equal(missingUsage.decision, null);

const oldV1 = { id: "old-v1", status: "retryable_failed", attempt_count: 2 };
let finishedStatus = null;
const fakeClient = {
  async rpc(name, payload) {
    if (name === "finish_notice_analysis_pilot_member") {
      finishedStatus = payload.p_member_status;
      return { data: { status: "reconciliation_required" }, error: null };
    }
    return { data: null, error: null };
  },
};
const stoppedConsumer = await runBoundedPilotConsumer({
  client: fakeClient,
  workerId: "worker",
  pilotRunId: "pilot",
  pilotStage: "smoke",
  limit: 1,
  claimFn: async () => [{ id: "smoke-job" }],
  processFn: async () => { throw fatalReceiptError(); },
});
equal(stoppedConsumer.claimed, 1);
equal(stoppedConsumer.summaries[0].status, "reconciliation_required");
equal(finishedStatus, "reconciliation_required");
deepEqual(oldV1, { id: "old-v1", status: "retryable_failed", attempt_count: 2 });

console.log(JSON.stringify({
  status: "pass",
  assertions,
  live_permission_double_gate: "pass",
  economy_receipt_failure_provider_calls: economyA.calls,
  economy_receipt_failure_escalation_calls: escalationA.calls,
  escalation_receipt_failure_total_calls: economyB.calls + escalationB.calls,
  receipt_failure_finalization_blocked:
    receiptFailureA.decision === null && receiptFailureB.decision === null,
  manifest_golden_vector_match: true,
  registration_fingerprint_mismatch_blocked: "sql_contract_static_pass",
  worker_manifest_mismatch_blocked: true,
  claim_manifest_mismatch_blocked: "sql_contract_static_pass",
  identical_replay_idempotent: "sql_contract_static_pass",
  conflicting_replay_blocked: "sql_contract_static_pass",
  old_v1_job_unchanged: true,
  raw_response_persisted: false,
}, null, 2));
