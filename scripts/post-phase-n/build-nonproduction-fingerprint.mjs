import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  FINGERPRINT_SCHEMA_VERSION,
  normalizeFingerprint,
} from "../../lib/post-phase-n-q/fingerprint.mjs";
import {
  APPROVED_NONPRODUCTION_PROJECT_REF,
  assertApprovedNonproductionTarget,
} from "../../lib/post-phase-n-q/safety.mjs";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(
  ROOT,
  "reports/post-phase-n-q/nonproduction-fingerprint.json",
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

async function exactCount(client, table) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  return {
    table,
    count: error ? null : count,
    reachable: !error,
    error_code: error?.code ?? null,
  };
}

async function stateDistribution(client, table, column) {
  const { data, error } = await client.from(table).select(column).limit(10_000);
  if (error) {
    return { table, column, reachable: false, error_code: error.code, values: {} };
  }
  const values = {};
  for (const row of data ?? []) {
    const key = String(row[column] ?? "null");
    values[key] = (values[key] ?? 0) + 1;
  }
  return { table, column, reachable: true, error_code: null, values };
}

function manifestObjects(manifest) {
  return {
    tables: manifest.new_tables.map((name) => ({
      schema: "public",
      name,
      rls_enabled: manifest.rls_enabled_tables.includes(name),
      definition_source: "reports/post-phase-l-schema-manifest.json",
    })),
    columns: [],
    indexes: manifest.new_indexes.map((name) => ({
      schema: "public",
      name,
      definition_source: "reports/post-phase-l-schema-manifest.json",
    })),
    constraints: [],
    policies: manifest.policies.map((name) => ({
      schema: "public",
      name,
      definition_source: "reports/post-phase-l-schema-manifest.json",
    })),
    grants: [],
    functions: manifest.new_functions.map((name) => ({
      schema: "public",
      name,
      definition_source: "reports/post-phase-l-schema-manifest.json",
    })),
    triggers: manifest.new_triggers.map((name) => ({
      schema: "public",
      name,
      definition_source: "reports/post-phase-l-schema-manifest.json",
    })),
    views: [],
    materialized_views: [],
  };
}

async function main() {
  loadEnvironment();
  const guard = assertApprovedNonproductionTarget(process.env);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  const manifest = readJson("reports/post-phase-l-schema-manifest.json");
  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const row_counts = await Promise.all(
    manifest.new_tables.map((table) => exactCount(client, table)),
  );
  const state_distributions = await Promise.all([
    stateDistribution(client, "review_decision_events", "decision"),
    stateDistribution(client, "crawled_notices", "status"),
    stateDistribution(client, "scholarships", "is_verified"),
    stateDistribution(client, "notice_sources", "enabled"),
  ]);
  const { data: guardRows, error: guardError } = await client
    .from("post_phase_l_environment_guard")
    .select("project_ref, environment_kind, automatic_public_publish_enabled")
    .limit(2);
  if (guardError) throw new Error(`Environment guard read failed: ${guardError.message}`);
  const environmentGuard = guardRows?.[0] ?? null;
  if (
    guardRows?.length !== 1 ||
    environmentGuard?.project_ref !== APPROVED_NONPRODUCTION_PROJECT_REF ||
    environmentGuard?.environment_kind !== "non_production" ||
    environmentGuard?.automatic_public_publish_enabled !== false
  ) {
    throw new Error("Non-production environment guard invariant failed");
  }

  const fingerprint = normalizeFingerprint({
    schema_version: FINGERPRINT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    evidence: {
      evidence_kind: "database_nonproduction",
      environment: "approved_nonproduction",
      bounded_scope: "repository manifest objects plus aggregate counts and state distributions",
      command: "node scripts/post-phase-n/build-nonproduction-fingerprint.mjs",
      report_path: "reports/post-phase-n-q/nonproduction-fingerprint.json",
      limitations: [
        "Column-level catalog metadata comes from repository SQL/manifest evidence.",
        "Database reads are aggregate counts or bounded state values only.",
        "This report does not claim production parity.",
      ],
    },
    project: {
      project_ref: APPROVED_NONPRODUCTION_PROJECT_REF,
      environment_kind: environmentGuard.environment_kind,
      automatic_public_publish_enabled:
        environmentGuard.automatic_public_publish_enabled,
      guard_verified: true,
    },
    completeness: {
      schema_metadata: "static_repository_manifest",
      runtime_presence_and_counts: "database_nonproduction",
      production_parity_claimed: false,
    },
    objects: manifestObjects(manifest),
    aggregates: {
      row_counts,
      state_distributions,
    },
    safety: {
      production_access_performed: false,
      production_read_performed: false,
      production_write_performed: false,
      database_write_performed: false,
      secrets_printed: false,
      target_guard: guard,
    },
  });

  writeJson(OUTPUT_PATH, fingerprint);
  console.log(JSON.stringify({
    passed: true,
    report_path: path.relative(ROOT, OUTPUT_PATH).replaceAll("\\", "/"),
    reachable_table_count: row_counts.filter((item) => item.reachable).length,
    missing_table_count: row_counts.filter((item) => !item.reachable).length,
    production_access_performed: false,
    database_write_performed: false,
  }, null, 2));
}

await main();
