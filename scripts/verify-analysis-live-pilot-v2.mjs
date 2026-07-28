import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";

const NAMESPACE = "five-case-live-pilot-v2";
if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
const guard = assertPostPhaseLTarget(process.env, { requireApply: false });
if (!process.argv.includes("--allow-nonproduction-db-read")) {
  throw new Error("--allow-nonproduction-db-read is required");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
const client = createClient(guard.target_project_url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: jobs, error } = await client.from("notice_analysis_jobs")
  .select("id,notice_id,revision_id,status,attempt_count,last_error_code,leased_by,lease_expires_at")
  .eq("metadata->>pilot_namespace", NAMESPACE)
  .order("created_at");
if (error) throw new Error(`pilot_v2_verify_failed:${error.code ?? "db_error"}`);
const jobIds = (jobs ?? []).map((row) => row.id);
const [{ data: runs }, { data: decisions }] = jobIds.length ? await Promise.all([
  client.from("notice_analysis_runs")
    .select("id,job_id,attempt_number,run_role,model,status,validation_status,input_token_count,output_token_count,estimated_cost_micros,latency_ms,error_code,metadata")
    .in("job_id", jobIds),
  client.from("notice_analysis_routing_decisions")
    .select("id,job_id,economy_run_id,escalation_run_id,selected_run_id,selected_result_id,reason_codes,policy_version")
    .in("job_id", jobIds),
]) : [{ data: [] }, { data: [] }];
const safeRuns = (runs ?? []).map((row) => ({
  ...row,
  metadata: {
    diagnostics: row.metadata?.diagnostics ?? null,
  },
}));
process.stdout.write(`${JSON.stringify({
  namespace: NAMESPACE,
  jobs: jobs ?? [],
  runs: safeRuns,
  routing_decisions: decisions ?? [],
  counts: {
    jobs: jobs?.length ?? 0,
    runs: runs?.length ?? 0,
    decisions: decisions?.length ?? 0,
    succeeded: jobs?.filter((row) => row.status === "succeeded").length ?? 0,
    retryable_failed: jobs?.filter((row) => row.status === "retryable_failed").length ?? 0,
    terminal_failed: jobs?.filter((row) => row.status === "terminal_failed").length ?? 0,
    budget_deferred: jobs?.filter((row) => row.status === "budget_deferred").length ?? 0,
  },
  production_access_count: 0,
  raw_provider_responses_included: false,
  secrets_printed: false,
}, null, 2)}\n`);
