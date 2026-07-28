import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { assertExplicitOperatorEnvironment } from "../lib/post-phase-l/operator-environment.mjs";

const NAMESPACE = "five-case-live-pilot-v2";
const pilotRunId = process.argv.find((value, index, values) =>
  values[index - 1] === "--pilot-run-id") ?? null;
if (!process.argv.includes("--allow-nonproduction-db-read")) {
  throw new Error("--allow-nonproduction-db-read is required");
}
const guard = assertExplicitOperatorEnvironment(process.env, {
  permissions: ["read"],
  requireServiceRole: true,
});
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
let pilotControlPlane = null;
if (pilotRunId) {
  const [
    { data: pilot, error: pilotError },
    { data: members, error: memberError },
    { data: receipts, error: receiptError },
  ] = await Promise.all([
    client.from("notice_analysis_pilot_runs")
      .select("id,namespace,pilot_version,status,current_stage,manifest_fingerprint,max_jobs,max_runs,max_escalations,budget_limit_micros,reserved_cost_micros,actual_cost_micros,usage_status,smoke_started_at,smoke_completed_at,expansion_approved_at,completed_at")
      .eq("id", pilotRunId).single(),
    client.from("notice_analysis_pilot_run_jobs")
      .select("job_id,execution_order,stage,expected_revision_id,expected_input_fingerprint,member_status,claimed_at,completed_at")
      .eq("pilot_run_id", pilotRunId).order("execution_order"),
    client.from("notice_analysis_provider_usage_receipts")
      .select("job_id,attempt_number,run_role,provider,model,provider_request_id,input_token_count,output_token_count,cached_input_token_count,estimated_cost_micros,actual_cost_micros,usage_status,pricing_version,received_at,request_fingerprint,response_fingerprint,safe_diagnostics")
      .eq("pilot_run_id", pilotRunId).order("received_at"),
  ]);
  if (pilotError || memberError || receiptError) {
    throw new Error("pilot_control_plane_verify_failed");
  }
  pilotControlPlane = { pilot, members, provider_usage_receipts: receipts };
}
process.stdout.write(`${JSON.stringify({
  namespace: NAMESPACE,
  jobs: jobs ?? [],
  runs: safeRuns,
  routing_decisions: decisions ?? [],
  pilot_control_plane: pilotControlPlane,
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
