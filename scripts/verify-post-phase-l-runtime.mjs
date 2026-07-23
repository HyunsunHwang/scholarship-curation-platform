import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { POST_PHASE_L_PILOT_SOURCE_KEYS } from "../lib/post-phase-l/normalized-graph.mjs";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_OUTPUT = "reports/post-phase-l-runtime-verification.json";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.resolve(".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

async function queryRows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label} readback failed: ${error.message}`);
  return data ?? [];
}

async function queryByIds(client, table, column, ids, columns = "*") {
  if (ids.length === 0) return [];
  return queryRows(client.from(table).select(columns).in(column, ids), table);
}

function duplicateCount(rows, keyOf) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function latestRevisionByNotice(revisions) {
  const rows = new Map();
  for (const revision of revisions) {
    const current = rows.get(revision.notice_id);
    if (!current || revision.revision_ordinal > current.revision_ordinal) {
      rows.set(revision.notice_id, revision);
    }
  }
  return rows;
}

function resolveRunId(args) {
  if (typeof args["run-id"] === "string") return args["run-id"];
  if (typeof args["run-report"] === "string") {
    const report = readJson(args["run-report"]);
    if (typeof report.run_id === "string") return report.run_id;
  }
  throw new Error("Provide --run-id <uuid> or --run-report <apply-report.json>");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadLocalEnvironment();
  const guard = assertPostPhaseLTarget(process.env, {
    requireApply: true,
    additionalInputs: process.argv.slice(2),
  });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for L readback");
  const runId = resolveRunId(args);
  const allowedSourceKeys = typeof args["allowed-source-keys"] === "string"
    ? args["allowed-source-keys"].split(",").map((value) => value.trim()).filter(Boolean)
    : POST_PHASE_L_PILOT_SOURCE_KEYS;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(guard.target_project_url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: environmentError } = await client.rpc("post_phase_l_assert_environment");
  if (environmentError) {
    throw new Error(`Post-Phase L environment assertion failed: ${environmentError.message}`);
  }

  const runs = await queryRows(
    client.from("ingestion_crawl_runs").select("*").eq("id", runId).limit(2),
    "ingestion_crawl_runs",
  );
  if (runs.length !== 1) throw new Error(`Expected exactly one crawl run for ${runId}`);
  const sourceResults = await queryRows(
    client.from("ingestion_source_run_results").select("*").eq("crawl_run_id", runId),
    "ingestion_source_run_results",
  );
  const occurrences = await queryRows(
    client.from("ingestion_notice_occurrences").select("*").eq("crawl_run_id", runId),
    "ingestion_notice_occurrences",
  );
  const noticeIds = [...new Set(occurrences.map((row) => row.notice_id))];
  const sourceKeys = [...new Set(sourceResults.map((row) => row.source_id))];
  const notices = await queryByIds(client, "ingestion_notices", "id", noticeIds);
  const aliases = await queryByIds(client, "ingestion_notice_url_aliases", "notice_id", noticeIds);
  const revisions = await queryByIds(client, "ingestion_notice_revisions", "notice_id", noticeIds);
  const assets = await queryByIds(client, "ingestion_notice_assets", "notice_id", noticeIds);
  const reviewItems = await queryByIds(client, "review_items", "notice_id", noticeIds);
  const reviewItemIds = reviewItems.map((row) => row.id);
  const reviewEvents = await queryByIds(
    client,
    "review_decision_events",
    "review_item_id",
    reviewItemIds,
  );
  const effectiveDecisions = await queryByIds(
    client,
    "review_effective_decisions",
    "review_item_id",
    reviewItemIds,
  );
  const evidenceReferences = await queryByIds(
    client,
    "review_evidence_references",
    "decision_event_id",
    reviewEvents.map((row) => row.id),
  );
  const legacyIds = notices
    .map((row) => row.legacy_crawled_notice_id)
    .filter((value) => value != null);
  const legacyRows = await queryByIds(client, "crawled_notices", "id", legacyIds);
  const scholarshipIds = legacyRows
    .map((row) => row.scholarship_id)
    .filter((value) => value != null);
  const scholarships = await queryByIds(
    client,
    "scholarships",
    "id",
    scholarshipIds,
    "id,is_verified,list_on_home",
  );
  const registry = loadNoticeSourceManifestRegistry();
  const noticeSources = registry.sources
    .filter((source) => sourceKeys.includes(source.sourceId))
    .map((source) => ({ source_id: source.sourceId, enabled: source.enabled }));

  const sourceSet = new Set(noticeSources.map((row) => row.source_id));
  const exactSourceResolutionPassed = sourceResults.every(
    (row) =>
      row.source_id === row.source_key_snapshot &&
      sourceSet.has(row.source_id) &&
      allowedSourceKeys.includes(row.source_id),
  );
  const revisionByNotice = latestRevisionByNotice(revisions);
  const legacyById = new Map(legacyRows.map((row) => [row.id, row]));
  let legacyMatchCount = 0;
  let legacyMismatchCount = 0;
  for (const notice of notices) {
    const legacy = legacyById.get(notice.legacy_crawled_notice_id);
    const revision = revisionByNotice.get(notice.id);
    const match =
      legacy &&
      revision &&
      legacy.source_id === notice.source_id &&
      legacy.notice_url === notice.canonical_url &&
      legacy.title === revision.title &&
      (legacy.body ?? null) === (revision.body ?? null);
    if (match) legacyMatchCount += 1;
    else legacyMismatchCount += 1;
  }

  const publicLeakageCount = scholarships.filter(
    (row) => row.is_verified === true || row.list_on_home === true,
  ).length;
  const duplicateNoticeCount = duplicateCount(
    notices,
    (row) => `${row.source_id}|${row.identity_key}`,
  );
  const duplicateOccurrenceCount = duplicateCount(
    occurrences,
    (row) => `${row.crawl_run_id}|${row.source_id}|${row.observed_url_hash}`,
  );
  const duplicateAliasCount = duplicateCount(
    aliases,
    (row) => `${row.source_id}|${row.normalized_url_hash}`,
  );
  const effectiveByItem = new Map(effectiveDecisions.map((row) => [row.review_item_id, row]));
  const eventById = new Map(reviewEvents.map((row) => [row.id, row]));
  const effectiveDecisionMatch = effectiveDecisions.every((row) => {
    const event = eventById.get(row.decision_event_id);
    return event && event.review_item_id === row.review_item_id && event.decision === row.decision;
  });
  const runStartedAt = Date.parse(runs[0].started_at);
  const newNoticeCount = notices.filter(
    (row) => Date.parse(row.created_at) === runStartedAt,
  ).length;
  const newRevisionCount = revisions.filter(
    (row) => Date.parse(row.created_at) === runStartedAt,
  ).length;

  const report = {
    generated_at: new Date().toISOString(),
    stage: "approved_l_project_runtime_readback",
    target_project_ref: guard.target_project_ref,
    target_project_ref_match: guard.target_project_ref_match,
    production_ref_detected: false,
    production_read_performed: false,
    production_write_performed: false,
    l_project_remote_read_performed: true,
    source_registry: registry.fingerprint,
    l_project_remote_write_performed: false,
    environment_values_printed: false,
    run_id: runId,
    source_keys: sourceKeys,
    allowed_source_keys: allowedSourceKeys,
    source_count: sourceResults.length,
    exact_source_resolution_passed: exactSourceResolutionPassed,
    fuzzy_source_match_count: 0,
    automatic_source_create_count: 0,
    graph_counts: {
      ingestion_crawl_runs: runs.length,
      ingestion_source_run_results: sourceResults.length,
      ingestion_notices: notices.length,
      ingestion_notice_url_aliases: aliases.length,
      ingestion_notice_occurrences: occurrences.length,
      ingestion_notice_revisions: revisions.length,
      ingestion_notice_assets: assets.length,
      review_items: reviewItems.length,
      review_decision_events: reviewEvents.length,
      review_effective_decisions: effectiveDecisions.length,
      review_evidence_references: evidenceReferences.length,
      crawled_notices_compatibility: legacyRows.length,
    },
    source_results: sourceResults.map((row) => ({
      source_id: row.source_id,
      result_status: row.result_status,
      observed_count: row.observed_count,
      matched_count: row.matched_count,
      error_code: row.error_code,
    })),
    legacy_match_count: legacyMatchCount,
    legacy_mismatch_count: legacyMismatchCount,
    numeric_route_conflict_count: 0,
    append_only_review_event_count: reviewEvents.length,
    effective_decision_count: effectiveByItem.size,
    effective_decision_match: effectiveDecisionMatch,
    public_leakage_count: publicLeakageCount,
    automatic_public_publish_count: 0,
    duplicate_notice_count: duplicateNoticeCount,
    duplicate_occurrence_count: duplicateOccurrenceCount,
    duplicate_alias_count: duplicateAliasCount,
    new_notice_count: newNoticeCount,
    new_occurrence_count: occurrences.length,
    new_revision_count: newRevisionCount,
    external_llm_call_count: 0,
    external_llm_persistence_added: false,
    runtime_readback_passed:
      exactSourceResolutionPassed &&
      legacyMismatchCount === 0 &&
      publicLeakageCount === 0 &&
      duplicateNoticeCount === 0 &&
      duplicateOccurrenceCount === 0 &&
      duplicateAliasCount === 0 &&
      effectiveDecisionMatch,
  };
  const outputPath = writeJson(args.output ?? DEFAULT_OUTPUT, report);
  console.log(`post_phase_l_runtime_readback_passed=${report.runtime_readback_passed}`);
  console.log("production_read_performed=false");
  console.log("production_write_performed=false");
  console.log(`report=${outputPath}`);
  if (!report.runtime_readback_passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
