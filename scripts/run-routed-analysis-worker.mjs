import fs from "node:fs";
import { executeRoutedAnalysisJob } from "../lib/analysis/analysis-routing.mjs";
import { createReplayProvider } from "../lib/analysis/analysis-worker-core.mjs";
import { createBudgetGuard } from "../lib/analysis/model-routing-policy.mjs";
import { buildAnalysisInput } from "../lib/analysis/analysis-input-builder.mjs";
import { stableAnalysisUuid } from "../lib/analysis/analysis-identifiers.mjs";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";

function value(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
if (process.argv.includes("--live") && !process.argv.includes("--allow-live-provider")) {
  throw new Error("live_provider_requires_allow_live_provider");
}
if (process.argv.includes("--db") && !process.argv.includes("--allow-db-write")) {
  throw new Error("database_write_requires_allow_db_write");
}
if (process.argv.includes("--db")) throw new Error("database_adapter_requires_007_apply_and_pilot_approval");
const live = process.argv.includes("--live");
const fixture = JSON.parse(fs.readFileSync(value("fixture", "fixtures/analysis-unit-1/eligible-analysis.json"), "utf8"));
const built = buildAnalysisInput(fixture, { promptVersion: "analysis-prompt-v1", schemaVersion: "analysis-schema-v1" });
const job = {
  id: stableAnalysisUuid("notice_analysis_jobs", built.input_fingerprint),
  notice_id: fixture.notice.id,
  revision_id: fixture.revision.id,
  prompt_version: "analysis-prompt-v1",
  schema_version: "analysis-schema-v1",
  input_fingerprint: built.input_fingerprint,
  attempt_count: 1,
  metadata: { input_profile: {} },
};
const budget = createBudgetGuard({
  maxJobs: Number(value("max-jobs", 1)),
  maxRuns: Number(value("max-runs", 2)),
  maxEscalations: Number(value("max-escalations", 1)),
  dailyBudgetMicros: Number(value("daily-budget-micros", 500000)),
});
const outcome = await executeRoutedAnalysisJob({
  job,
  revision: fixture.revision,
  notice: fixture.notice,
  assets: fixture.assets,
  source: fixture.source,
  privacy_status: fixture.privacy_status,
  economyProvider: live
    ? { mode: "live", call: callAnthropic }
    : createReplayProvider(fixture.provider_response),
  escalationProvider: live
    ? { mode: "live", call: callAnthropic }
    : createReplayProvider(fixture.provider_response),
  budget,
});
console.log(JSON.stringify({
  mode: live ? "bounded_live_fixture" : "mock_replay",
  writes_performed: false,
  provider_calls_live: live,
  status: outcome.status,
  reasons: outcome.reasons,
  decision: outcome.decision,
  budget: budget.state,
}, null, 2));
