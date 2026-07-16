import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPostPhaseMCohortPlan,
  orgUnitIdentity,
  POST_PHASE_M_CONTROL_SOURCE_KEYS,
  POST_PHASE_M_EXPANSION_SOURCE_KEYS,
  sameSourceMetadata,
  sourceInsertRow,
} from "../lib/post-phase-m/controlled-cohort.mjs";
import {
  assertPostPhaseLTarget,
  POST_PHASE_L_TARGET_PROJECT_REF,
  POST_PHASE_L_TARGET_PROJECT_URL,
} from "../lib/post-phase-l/target-guard.mjs";

const __filename = fileURLToPath(import.meta.url);
const PLAN_PATH = "reports/post-phase-m-cohort-seed-plan.json";
const RESULT_PATH = "reports/post-phase-m-cohort-seed-result.json";

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
}

async function queryRows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data ?? [];
}

async function resolveOrgUnit(client, source, insertedOrgUnitIds) {
  const identity = orgUnitIdentity(source);
  const matches = await queryRows(
    client.from("org_units").select("id,unit_type,name,legacy_table,legacy_id")
      .eq("legacy_table", identity.legacy_table).eq("legacy_id", identity.legacy_id).limit(2),
    `org unit ${source.source_id}`,
  );
  if (matches.length > 1) throw new Error("ambiguous_org_unit_identity");
  if (matches.length === 1) {
    if (matches[0].unit_type !== identity.unit_type || matches[0].name !== identity.name) {
      throw new Error("conflicting_org_unit_metadata");
    }
    return { id: matches[0].id, status: "existing" };
  }
  const inserted = await queryRows(
    client.from("org_units").insert({ ...identity, path_ids: [] }).select("id").limit(1),
    `org unit insert ${source.source_id}`,
  );
  if (inserted.length !== 1) throw new Error("org_unit_insert_readback_missing");
  insertedOrgUnitIds.push(inserted[0].id);
  return { id: inserted[0].id, status: "inserted" };
}

async function applySeed(client, plan) {
  const result = {
    inserted_source_count: 0, existing_source_count: 0, conflicting_source_count: 0,
    skipped_source_count: 0, inserted_org_unit_count: 0, existing_org_unit_count: 0,
    source_results: [], inserted_source_keys: [], inserted_org_unit_ids: [],
  };
  const existingRows = await queryRows(
    client.from("notice_sources").select("*").in("source_id", plan.source_keys),
    "controlled cohort source readback",
  );
  const existingByKey = new Map(existingRows.map((row) => [row.source_id, row]));

  for (const sourceKey of POST_PHASE_M_CONTROL_SOURCE_KEYS) {
    const existing = existingByKey.get(sourceKey);
    if (!existing || existing.enabled !== true) {
      result.conflicting_source_count += 1;
      result.source_results.push({ source_key: sourceKey, status: "conflicting", reason: "required_control_source_missing_or_disabled" });
    } else {
      result.existing_source_count += 1;
      result.source_results.push({ source_key: sourceKey, status: "existing_preserved" });
    }
  }

  for (const sourceKey of POST_PHASE_M_EXPANSION_SOURCE_KEYS) {
    const source = plan.sources.find((row) => row.source_id === sourceKey);
    const existing = existingByKey.get(sourceKey);
    if (existing) {
      const planned = sourceInsertRow(source, existing.org_unit_id);
      if (!sameSourceMetadata(existing, planned)) {
        result.conflicting_source_count += 1;
        result.source_results.push({ source_key: sourceKey, status: "conflicting", reason: "existing_source_metadata_conflict" });
      } else {
        result.existing_source_count += 1;
        result.source_results.push({ source_key: sourceKey, status: "existing_exact" });
      }
      continue;
    }
    try {
      const orgUnit = await resolveOrgUnit(client, source, result.inserted_org_unit_ids);
      result[`${orgUnit.status}_org_unit_count`] += 1;
      const inserted = await queryRows(
        client.from("notice_sources").insert(sourceInsertRow(source, orgUnit.id)).select("source_id").limit(1),
        `notice source insert ${sourceKey}`,
      );
      if (inserted.length !== 1 || inserted[0].source_id !== sourceKey) throw new Error("source_insert_readback_missing");
      result.inserted_source_count += 1;
      result.inserted_source_keys.push(sourceKey);
      result.source_results.push({ source_key: sourceKey, status: "inserted_exact", org_unit_status: orgUnit.status });
    } catch (error) {
      result.conflicting_source_count += 1;
      result.source_results.push({ source_key: sourceKey, status: "conflicting", reason: error?.message ?? String(error) });
    }
  }
  return result;
}

async function rollbackSeed(client) {
  const removable = await queryRows(
    client.from("notice_sources").select("source_id,org_unit_id,notes").in("source_id", POST_PHASE_M_EXPANSION_SOURCE_KEYS),
    "M seed rollback source readback",
  );
  const owned = removable.filter((row) =>
    row.notes === "Post-Phase M controlled cohort; exact committed sanitized inventory.",
  );
  const orgUnitIds = owned.map((row) => row.org_unit_id).filter((value) => value != null);
  if (owned.length > 0) {
    const { error } = await client.from("notice_sources").delete().in("source_id", owned.map((row) => row.source_id));
    if (error) throw new Error(`M seed rollback source delete failed: ${error.message}`);
  }
  if (orgUnitIds.length > 0) {
    const { error } = await client.from("org_units").delete().in("id", orgUnitIds);
    if (error) throw new Error(`M seed rollback org unit delete failed: ${error.message}`);
  }
  return { deleted_source_count: owned.length, deleted_org_unit_count: orgUnitIds.length };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rollback = process.argv.includes("--rollback");
  const plan = buildPostPhaseMCohortPlan();
  if (!plan.exact_source_resolution_passed) throw new Error(`Controlled cohort inventory conflict count: ${plan.conflicts.length}`);
  const dryGuard = assertPostPhaseLTarget({
    POST_PHASE_L_TARGET_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: POST_PHASE_L_TARGET_PROJECT_URL,
  });
  writeJson(PLAN_PATH, {
    generated_at: new Date().toISOString(), stage: "post_phase_m_cohort_seed_plan", dry_run: !apply,
    ...plan, target_project_ref_match: dryGuard.target_project_ref_match,
    production_ref_detected: false, remote_read_performed: false, remote_write_performed: false,
    rollback_strategy: "delete only exact M-noted expansion sources after bounded run rollback, then delete their unreferenced M org units",
  });
  if (!apply) {
    console.log("post_phase_m_cohort_seed_dry_run=true");
    console.log(`report=${path.resolve(PLAN_PATH)}`);
    return;
  }

  loadLocalEnvironment();
  const guard = assertPostPhaseLTarget(process.env, { requireApply: true, additionalInputs: process.argv.slice(2) });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for approved M seed apply");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(guard.target_project_url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: environmentError } = await client.rpc("post_phase_l_assert_environment");
  if (environmentError) throw new Error(`Environment assertion failed: ${environmentError.message}`);
  const operation = rollback ? await rollbackSeed(client) : await applySeed(client, plan);
  const report = {
    generated_at: new Date().toISOString(),
    stage: rollback ? "post_phase_m_cohort_seed_rollback" : "post_phase_m_cohort_seed_apply",
    target_project_ref: guard.target_project_ref, target_project_ref_match: guard.target_project_ref_match,
    production_ref_detected: false, production_read_performed: false, production_write_performed: false,
    non_production_remote_read_performed: true, non_production_remote_write_performed: true,
    exact_source_resolution_passed: plan.exact_source_resolution_passed,
    fuzzy_source_match_count: 0, automatic_source_create_count: 0,
    inventory_only_risk: plan.inventory_only_risk, operation,
    passed: rollback || operation.conflicting_source_count === 0,
  };
  writeJson(RESULT_PATH, report);
  console.log(`post_phase_m_cohort_seed_passed=${report.passed}`);
  console.log("production_read_performed=false");
  console.log("production_write_performed=false");
  console.log(`report=${path.resolve(RESULT_PATH)}`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => { console.error(error?.message ?? error); process.exitCode = 1; });
}
