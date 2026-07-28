import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  assertExplicitOperatorEnvironment,
  operatorEnvironmentSummary,
} from "../lib/post-phase-l/operator-environment.mjs";
import { fingerprintPilotManifest } from "../lib/analysis/analysis-pilot-manifest.mjs";

const NAMESPACE = "five-case-live-pilot-v2";
const JOB_IDS = [
  "31292cbb-0498-5db6-bc7a-13165d3d0820",
  "2e5f7bbf-f854-53d0-93db-955f30443926",
  "be3f5cc6-34f0-5cb4-be19-05b861c4acff",
  "76d9a116-786d-5e8b-bb10-8622e99b2032",
  "cffe0fc5-6ce3-5e5f-84e9-20b8f8c6bb16",
];

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const next = argv[index + 1];
    result[current.slice(2)] = !next || next.startsWith("--") ? true : next;
    if (result[current.slice(2)] !== true) index += 1;
  }
  return result;
}

const options = parseArgs(process.argv.slice(2));
const write = Boolean(options["register-pilot-run"]);
if (!options["allow-nonproduction-db-read"]) {
  throw new Error("--allow-nonproduction-db-read is required");
}
if (write && !options["allow-nonproduction-db-write"]) {
  throw new Error("--allow-nonproduction-db-write is required for registration");
}
const guard = assertExplicitOperatorEnvironment(process.env, {
  requireApply: write,
  permissions: write ? ["read", "write"] : ["read"],
  requireServiceRole: true,
});
const client = createClient(guard.target_project_url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: jobs, error: jobError } = await client.from("notice_analysis_jobs")
  .select("id,revision_id,status,attempt_count,leased_by,lease_expires_at,input_fingerprint,prompt_version,schema_version,model_policy,metadata")
  .in("id", JOB_IDS);
if (jobError) throw new Error(`pilot_registration_read_failed:${jobError.code ?? "db_error"}`);
const orderedJobs = JOB_IDS.map((id) => jobs?.find((job) => job.id === id)).filter(Boolean);
if (orderedJobs.length !== JOB_IDS.length) throw new Error("pilot_registration_exact_ids_missing");

const [{ data: runs, error: runsError }, { data: decisions, error: decisionsError }] =
  await Promise.all([
    client.from("notice_analysis_runs").select("id,job_id").in("job_id", JOB_IDS),
    client.from("notice_analysis_routing_decisions").select("id,job_id").in("job_id", JOB_IDS),
  ]);
if (runsError || decisionsError) throw new Error("pilot_registration_history_read_failed");

for (const job of orderedJobs) {
  if (job.metadata?.pilot_namespace !== NAMESPACE
      || job.status !== "pending"
      || Number(job.attempt_count) !== 0
      || job.leased_by
      || (job.lease_expires_at && job.lease_expires_at > new Date().toISOString())
      || runs?.some((run) => run.job_id === job.id)
      || decisions?.some((decision) => decision.job_id === job.id)) {
    throw new Error(`pilot_registration_precondition_failed:${job.id}`);
  }
}
for (const field of ["prompt_version", "schema_version", "model_policy"]) {
  if (new Set(orderedJobs.map((job) => job[field])).size !== 1) {
    throw new Error(`pilot_registration_contract_mismatch:${field}`);
  }
}

const members = orderedJobs.map((job, index) => ({
  job_id: job.id,
  execution_order: index + 1,
  stage: index === 0 ? "smoke" : "expansion",
  expected_revision_id: job.revision_id,
  expected_input_fingerprint: job.input_fingerprint,
}));
const manifestFingerprint = fingerprintPilotManifest(members);
const pilot = {
  namespace: NAMESPACE,
  pilot_version: "v2-control-plane-1",
  target_project_ref: guard.target_project_ref,
  prompt_version: orderedJobs[0].prompt_version,
  schema_version: orderedJobs[0].schema_version,
  model_policy_version: orderedJobs[0].model_policy,
  manifest_fingerprint: manifestFingerprint,
  max_runs: Number(options["max-runs"] ?? 10),
  max_escalations: Number(options["max-escalations"] ?? 5),
  budget_limit_micros: Number(options["pilot-budget-micros"] ?? 500000),
  metadata: { source: "existing-five-case-live-pilot-v2", synthetic_fixture: true },
};
let registration = null;
if (write) {
  const { data, error } = await client.rpc("create_or_register_notice_analysis_pilot_run", {
    p_pilot_run: pilot,
    p_members: members,
  });
  if (error) throw new Error(`pilot_registration_failed:${error.message}`);
  registration = data;
}

process.stdout.write(`${JSON.stringify({
  status: write ? "registered_or_replayed" : "preview_ready",
  write_performed: write,
  pilot_run_id: registration?.id ?? null,
  manifest_fingerprint: manifestFingerprint,
  smoke_job_id: members[0].job_id,
  members,
  environment: operatorEnvironmentSummary(guard),
  anthropic_calls: 0,
  production_access_count: 0,
  existing_analysis_jobs_modified: false,
  secrets_printed: false,
}, null, 2)}\n`);
