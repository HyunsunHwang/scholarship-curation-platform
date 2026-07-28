import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";
import { executeRoutedAnalysisJob } from "../lib/analysis/analysis-routing.mjs";
import { createBudgetGuard } from "../lib/analysis/model-routing-policy.mjs";
import {
  runBoundedDbConsumer,
  validateBoundedDbConsumerPreflight,
} from "../lib/analysis/analysis-db-consumer.mjs";
import { createReplayProvider } from "../lib/analysis/analysis-worker-core.mjs";
import { buildAnalysisInput } from "../lib/analysis/analysis-input-builder.mjs";
import { stableAnalysisUuid } from "../lib/analysis/analysis-identifiers.mjs";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";
import { persistRoutedSuccessInMemory } from "../lib/analysis/analysis-routed-persistence.mjs";

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const next = argv[i + 1];
    result[key.slice(2)] = !next || next.startsWith("--") ? true : next;
    if (result[key.slice(2)] !== true) i += 1;
  }
  return result;
}

function loadEnv() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
}

function dbClient() {
  const guard = assertPostPhaseLTarget({
    POST_PHASE_L_TARGET_PROJECT_REF: process.env.POST_PHASE_L_TARGET_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }, { requireApply: true });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(guard.target_project_url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function fixtureJob(fixture) {
  const built = buildAnalysisInput(fixture, {
    promptVersion: "analysis-prompt-v1",
    schemaVersion: "analysis-schema-v1",
  });
  return {
    id: stableAnalysisUuid("notice_analysis_jobs", built.input_fingerprint),
    notice_id: fixture.notice.id,
    revision_id: fixture.revision.id,
    prompt_version: "analysis-prompt-v1",
    schema_version: "analysis-schema-v1",
    input_fingerprint: built.input_fingerprint,
    attempt_count: 1,
    status: "leased",
    leased_by: `routed-worker-${process.pid}`,
    lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
    metadata: { input_profile: {} },
  };
}

async function runMockOrFixture(options) {
  const live = options.mode === "bounded-live-fixture";
  if (live && !options["allow-live-provider"]) {
    throw new Error("--allow-live-provider is required");
  }
  const fixture = JSON.parse(fs.readFileSync(
    path.resolve(String(options.fixture ?? "fixtures/analysis-unit-1/eligible-analysis.json")),
    "utf8",
  ));
  const job = fixtureJob(fixture);
  const budget = createBudgetGuard({
    maxJobs: Number(options["max-jobs"] ?? 1),
    maxRuns: Number(options["max-runs"] ?? 2),
    maxEscalations: Number(options["max-escalations"] ?? 1),
    runBudgetMicros: Number(options["run-budget-micros"] ?? 500_000),
    dailyBudgetMicros: Number(options["daily-budget-micros"] ?? 2_000_000),
  });
  const provider = live
    ? { mode: "live", call: callAnthropic }
    : createReplayProvider(fixture.provider_response);
  const outcome = await executeRoutedAnalysisJob({
    job,
    revision: fixture.revision,
    notice: fixture.notice,
    assets: fixture.assets,
    source: fixture.source,
    privacy_status: fixture.privacy_status,
    economyProvider: provider,
    escalationProvider: provider,
    budget,
  });
  const memory = outcome.ok
    ? persistRoutedSuccessInMemory({
      state: { jobs: [job], runs: [], results: [], evidence: [], decisions: [] },
      job,
      workerId: job.leased_by,
      routedOutcome: outcome,
    })
    : null;
  console.log(JSON.stringify({
    mode: options.mode ?? "mock",
    writes_performed: false,
    memory_persist_ok: memory?.ok ?? false,
    provider_calls_live: live,
    status: outcome.status,
    reasons: outcome.reasons,
    decision: outcome.decision ?? null,
    budget: budget.state,
  }, null, 2));
  if (!outcome.ok) process.exitCode = 1;
}

async function main() {
  loadEnv();
  const options = args(process.argv.slice(2));
  const mode = String(options.mode ?? "mock");
  if (mode === "mock" || mode === "bounded-live-fixture") {
    await runMockOrFixture({ ...options, mode: mode === "mock" ? "mock" : "bounded-live-fixture" });
    return;
  }
  if (mode !== "bounded-db-consumer") throw new Error("unsupported_mode");
  if (!options["allow-nonproduction-db-write"]) {
    throw new Error("--allow-nonproduction-db-write is required");
  }
  if (!options["allow-db-queue"]) throw new Error("--allow-db-queue is required");
  const preflight = validateBoundedDbConsumerPreflight({
    live: Boolean(options["allow-live-provider"]),
    fixturePath: options.fixture ? path.resolve(String(options.fixture)) : null,
  });
  const client = dbClient();
  const workerId = `routed-analysis-${process.pid}`;
  const limit = Math.max(1, Math.min(Number(options.limit ?? 3), 5));
  const result = await runBoundedDbConsumer({
    client,
    workerId,
    limit,
    live: preflight.mode === "live",
    replayResponse: preflight.replayResponse,
    budgetOptions: {
      maxJobs: limit,
      maxRuns: Math.min(Number(options["max-runs"] ?? limit * 2), 10),
      maxEscalations: Math.min(Number(options["max-escalations"] ?? limit), 5),
      runBudgetMicros: Number(options["run-budget-micros"] ?? 500_000),
      dailyBudgetMicros: Number(
        options["pilot-budget-micros"] ?? options["daily-budget-micros"] ?? 500_000,
      ),
    },
  });
  console.log(JSON.stringify({
    mode,
    writes_performed: true,
    provider_calls_live: preflight.mode === "live",
    ...result,
  }, null, 2));
  if (result.summaries.some((row) => !row.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`routed_analysis_worker_failed=${error.message}`);
  process.exitCode = 1;
});
