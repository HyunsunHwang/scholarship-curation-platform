import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  POST_PHASE_L_TARGET_PROJECT_REF,
  inspectPostPhaseLTarget,
} from "../lib/post-phase-l/target-guard.mjs";
import { loadModelPolicy } from "../lib/analysis/model-routing-policy.mjs";

const PROJECT_NAME = "scholarship-curation-post-phase-l";
const REPORT_PATH = "reports/analysis-nonproduction-pilot-latest.json";
const MIGRATIONS = [
  "001_post_phase_l_compatibility_baseline.sql",
  "002_post_phase_l_normalized_graph.sql",
  "003_post_phase_l_pilot_seed.sql",
  "004_notice_analysis_schema.sql",
  "005_notice_analysis_review_and_finalize.sql",
  "006_program_cycle_canonical_and_projection.sql",
  "007_analysis_routing_and_identity_hardening.sql",
];

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    result[key] = !next || next.startsWith("--") ? true : next;
    if (result[key] !== true) index += 1;
  }
  return result;
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
}

function executablePresent(name) {
  return spawnSync("sh", ["-c", `command -v ${name}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).status === 0;
}

function fileInventory() {
  const root = "supabase/post-phase-l";
  return {
    migrations: Object.fromEntries(MIGRATIONS.map((name) => [
      name, fs.existsSync(path.join(root, name)),
    ])),
    verify_schema: fs.existsSync(path.join(root, "verify_post_phase_l_schema.sql")),
    verify_analysis_pilot: fs.existsSync(
      path.join(root, "verify_analysis_nonproduction_pilot.sql"),
    ),
    bounded_data_rollback: fs.existsSync(path.join(root, "900_post_phase_l_bounded_data_rollback.sql")),
    schema_rollback: fs.existsSync(path.join(root, "999_post_phase_l_schema_rollback.sql")),
  };
}

function missingCredentials(stage) {
  const required = ["POST_PHASE_L_TARGET_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY"];
  if (stage === "live-pilot") required.push("ANTHROPIC_API_KEY");
  return required.filter((name) => !process.env[name]);
}

function stageFlags(stage, options) {
  if (stage === "fixture-db-smoke") {
    return ["allow-nonproduction-db-write"].filter((name) => !options[name]);
  }
  if (stage === "live-pilot") {
    return [
      "allow-nonproduction-db-write", "allow-db-queue", "allow-live-provider",
    ].filter((name) => !options[name]);
  }
  return [];
}

function writeReport(report, outputPath) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

function buildReport(stage, options) {
  const guard = inspectPostPhaseLTarget(process.env, {
    requireApply: stage !== "preflight",
  });
  const inventory = fileInventory();
  const missing = missingCredentials(stage);
  const missingFlags = stageFlags(stage, options);
  const modelPolicy = loadModelPolicy();
  const migrationFilesComplete = Object.values(inventory.migrations).every(Boolean);
  const tooling = {
    node: executablePresent("node"),
    psql: executablePresent("psql"),
    supabase_cli: executablePresent("supabase"),
  };
  const blockers = [
    ...guard.errors,
    ...missing.map((name) => `credential_missing:${name}`),
    ...missingFlags.map((name) => `explicit_flag_missing:${name}`),
    ...(!migrationFilesComplete ? ["migration_file_inventory_incomplete"] : []),
    ...(!inventory.verify_schema ? ["schema_verifier_missing"] : []),
  ];
  if (stage !== "preflight" && !tooling.psql && !tooling.supabase_cli) {
    blockers.push("sql_migration_transport_unavailable");
  }
  return {
    report_version: "analysis-nonproduction-pilot-v1",
    generated_at: new Date().toISOString(),
    status: blockers.length ? "blocked" : "ready_for_operator_execution",
    stage,
    stage_model: {
      new_phase_or_unit_created: false,
      work_name: "Non-Production L Sandbox: Migration, Fixture Smoke, and Five-Case Live Pilot",
    },
    target_environment: {
      project_name: PROJECT_NAME,
      expected_project_ref: POST_PHASE_L_TARGET_PROJECT_REF,
      exact_target_guard_passed: guard.safe,
      production_ref_detected: guard.production_ref_detected,
      production_access_count: 0,
      credential_source_category: "existing_local_environment_only",
      secret_values_printed: false,
    },
    preflight: {
      local_file_inventory: inventory,
      tooling,
      database_connection_attempted: false,
      database_snapshot_completed: false,
      database_drift_checked: false,
      missing_environment_variables: missing,
      credential_presence: {
        service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        anthropic_api: Boolean(process.env.ANTHROPIC_API_KEY),
      },
      missing_explicit_flags: missingFlags,
    },
    migrations: {
      applied: [],
      transaction_status: "not_started",
      verification_status: "not_started",
    },
    fixture_db_smoke: {
      status: "not_started",
      cases_executed: 0,
    },
    live_pilot: {
      status: "not_started",
      max_jobs: Math.min(Number(options.limit ?? 5), 5),
      max_runs: Math.min(Number(options["max-runs"] ?? 10), 10),
      max_escalations: Math.min(Number(options["max-escalations"] ?? 5), 5),
      pilot_budget_micros: options["pilot-budget-micros"]
        ? Number(options["pilot-budget-micros"]) : null,
      economy_model: modelPolicy.roles.economy.model,
      escalation_model: modelPolicy.roles.escalation.model,
      provider_runs: 0,
      actual_cost_micros: 0,
    },
    safety: {
      production_db_access: 0,
      production_db_write: 0,
      public_write: 0,
      canonical_approval: 0,
      automatic_semantic_approval: 0,
      legacy_schedule_changed: false,
      secrets_committed_or_printed: false,
    },
    blockers: [...new Set(blockers)],
  };
}

function main() {
  loadLocalEnvironment();
  const options = parseArgs(process.argv.slice(2));
  const stage = String(options.stage ?? "preflight");
  if (!["preflight", "fixture-db-smoke", "live-pilot"].includes(stage)) {
    throw new Error("unsupported_stage");
  }
  const report = buildReport(stage, options);
  writeReport(report, String(options.out ?? REPORT_PATH));
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    stage: report.stage,
    expected_project_ref: report.target_environment.expected_project_ref,
    exact_target_guard_passed: report.target_environment.exact_target_guard_passed,
    blockers: report.blockers,
    report: String(options.out ?? REPORT_PATH),
    secret_values_printed: false,
  }, null, 2)}\n`);
  if (report.status === "blocked") process.exitCode = 2;
}

main();
