import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildNormalizedGraphPlan,
  summarizeGraphPlan,
} from "../lib/post-phase-l/normalized-graph.mjs";
import { resolveExactSourceKey } from "../lib/post-phase-l/source-resolver.mjs";
import {
  assertPostPhaseLTarget,
  POST_PHASE_L_TARGET_PROJECT_REF,
  POST_PHASE_L_TARGET_PROJECT_URL,
} from "../lib/post-phase-l/target-guard.mjs";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_INPUT = "fixtures/post-phase-l/pilot-fixture.json";
const DEFAULT_INVENTORY = "docs/post-phase-l-schema-inventory.json";
const DEFAULT_OUTPUT = "reports/post-phase-l-pilot-run.json";

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  process.loadEnvFile(envPath);
}

function classifyRunnerError(message) {
  const value = String(message ?? "").toLowerCase();
  if (/tls|certificate|socket|timeout|fetch failed|econn/.test(value)) {
    return "blocked_transport";
  }
  return "blocked_parser";
}

export function normalizePilotInput(input) {
  if (Array.isArray(input.source_results)) return input;
  if (!Array.isArray(input.perSource) || !Array.isArray(input.newNotices)) {
    throw new Error("Unsupported Post-Phase L input shape");
  }

  return {
    generated_at: input.runAt,
    run: {
      idempotency_key:
        input.idempotencyKey ?? `post-phase-l-live-${String(input.runAt).replace(/[^0-9]/g, "")}`,
      execution_mode: "live",
      runner_version: "main-runner+post-phase-l-v1",
      status: input.perSource.some((row) => row.error) ? "degraded" : "succeeded",
      started_at: input.runAt,
      finished_at: input.runAt,
      metadata: {
        bounded: true,
        source_allowlist: input.perSource.map((row) => row.sourceId),
        runner_totals: input.totals ?? {},
        external_llm_call_count: 0,
      },
    },
    source_results: input.perSource.map((row) => {
      const notices = input.newNotices
        .filter((notice) => notice.sourceId === row.sourceId)
        .map((notice) => ({
          title: notice.title,
          original_url: notice.noticeUrl,
          canonical_url: notice.noticeUrl,
          notice_posted_at: notice.parsedDate || null,
          raw_date_text: notice.detailDate || notice.dateText || null,
          body: notice.content || null,
          image_urls: notice.imageUrls ?? [],
          attachment_metadata: notice.attachmentMetadata ?? [],
          body_quality_status: notice.bodyQualityStatus,
          normalized_payload: notice.normalized_payload ?? {},
          parser_version: "main-runner",
          provenance: {
            source_key: row.sourceId,
            adapter_strategy: row.adapterStrategy ?? "generic_html",
            data_backing: "live_bounded",
          },
        }));
      const status = row.error
        ? classifyRunnerError(row.error)
        : notices.length > 0
          ? "success"
          : "zero_match_observed";
      return {
        source_key: row.sourceId,
        source_id: row.sourceId,
        source_name: row.sourceName,
        result_status: status,
        observed_count: row.crawledCount ?? 0,
        matched_count: row.matchedCount ?? 0,
        retry_count: row.retryCount ?? 0,
        error_code: row.error ? status : null,
        error_message: row.error || null,
        evidence: {
          adapter_strategy: row.adapterStrategy ?? "generic_html",
          zero_match_is_absence: false,
        },
        notices,
      };
    }),
  };
}

function localResolve(input, inventory) {
  const rows = inventory.pilot_sources.map((source) => ({
    source_id: source.canonical_source_id,
    source_name: source.source_name,
  }));
  return {
    ...input,
    source_results: input.source_results.map((result) => {
      const resolution = resolveExactSourceKey(result.source_key, rows);
      if (resolution.blocked) {
        throw new Error(`Local exact source resolution blocked: ${resolution.reason}`);
      }
      return { ...result, source_id: resolution.source_id };
    }),
  };
}

async function remoteResolve(input, supabase) {
  const resolved = [];
  for (const result of input.source_results) {
    const { data, error } = await supabase
      .from("notice_sources")
      .select("source_id, source_name, enabled")
      .eq("source_id", result.source_key)
      .limit(2);
    if (error) throw new Error(`Exact source query failed: ${error.message}`);
    const resolution = resolveExactSourceKey(result.source_key, data ?? []);
    if (resolution.blocked) {
      throw new Error(`Remote exact source resolution blocked: ${resolution.reason}`);
    }
    if (resolution.source.enabled !== true) {
      throw new Error(`Remote source is disabled: ${result.source_key}`);
    }
    resolved.push({ ...result, source_id: resolution.source_id });
  }
  return { ...input, source_results: resolved };
}

async function upsertRows(supabase, table, rows, options) {
  if (rows.length === 0) return 0;
  const { error } = await supabase.from(table).upsert(rows, options);
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  return rows.length;
}

async function applyGraphPlan(supabase, plan) {
  const tables = plan.tables;
  const attempted = {};
  attempted.ingestion_crawl_runs = await upsertRows(
    supabase,
    "ingestion_crawl_runs",
    tables.ingestion_crawl_runs,
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  attempted.ingestion_source_run_results = await upsertRows(
    supabase,
    "ingestion_source_run_results",
    tables.ingestion_source_run_results,
    { onConflict: "crawl_run_id,source_id", ignoreDuplicates: true },
  );
  attempted.ingestion_notices = await upsertRows(
    supabase,
    "ingestion_notices",
    tables.ingestion_notices,
    { onConflict: "source_id,identity_key" },
  );
  attempted.ingestion_notice_url_aliases = await upsertRows(
    supabase,
    "ingestion_notice_url_aliases",
    tables.ingestion_notice_url_aliases,
    { onConflict: "source_id,normalized_url_hash" },
  );
  attempted.ingestion_notice_occurrences = await upsertRows(
    supabase,
    "ingestion_notice_occurrences",
    tables.ingestion_notice_occurrences,
    { onConflict: "crawl_run_id,source_id,observed_url_hash", ignoreDuplicates: true },
  );
  attempted.ingestion_notice_revisions = await upsertRows(
    supabase,
    "ingestion_notice_revisions",
    tables.ingestion_notice_revisions,
    { onConflict: "notice_id,content_hash", ignoreDuplicates: true },
  );
  attempted.ingestion_notice_assets = await upsertRows(
    supabase,
    "ingestion_notice_assets",
    tables.ingestion_notice_assets,
    { onConflict: "occurrence_id,original_url_hash", ignoreDuplicates: true },
  );
  attempted.review_items = await upsertRows(
    supabase,
    "review_items",
    tables.review_items,
    { onConflict: "notice_id,review_scope" },
  );

  const compatibilityRows = tables.crawled_notices_compatibility.map(
    ({ graph_notice_id: graphNoticeId, ...row }) => {
      if (!graphNoticeId) throw new Error("Compatibility row is missing graph_notice_id");
      return row;
    },
  );
  const compatibilityUrls = compatibilityRows.map((row) => row.notice_url);
  const existingCompatibility = compatibilityUrls.length === 0
    ? []
    : await (async () => {
        const { data, error } = await supabase
          .from("crawled_notices")
          .select("id,notice_url")
          .in("notice_url", compatibilityUrls);
        if (error) throw new Error(`Compatibility reconciliation read failed: ${error.message}`);
        return data ?? [];
      })();
  const existingCompatibilityUrls = new Set(existingCompatibility.map((row) => row.notice_url));
  const newCompatibilityRows = compatibilityRows.filter(
    (row) => !existingCompatibilityUrls.has(row.notice_url),
  );
  await upsertRows(
    supabase,
    "crawled_notices",
    newCompatibilityRows,
    { onConflict: "notice_url", ignoreDuplicates: true },
  );
  const mutableCompatibilityFields = [
    "source_group", "source_id", "source_name", "title", "notice_posted_at",
    "raw_date_text", "body", "image_urls", "scholarship_type", "run_at",
  ];
  for (const row of compatibilityRows.filter((item) => existingCompatibilityUrls.has(item.notice_url))) {
    const patch = Object.fromEntries(
      mutableCompatibilityFields.map((field) => [field, row[field]]),
    );
    const { error } = await supabase
      .from("crawled_notices")
      .update(patch)
      .eq("notice_url", row.notice_url);
    if (error) throw new Error(`Compatibility reconciliation update failed: ${error.message}`);
  }
  attempted.crawled_notices_compatibility = compatibilityRows.length;
  attempted.crawled_notices_compatibility_inserted = newCompatibilityRows.length;
  attempted.crawled_notices_compatibility_reconciled =
    compatibilityRows.length - newCompatibilityRows.length;

  const compatibilityByUrl = new Map(
    tables.crawled_notices_compatibility.map((row) => [row.notice_url, row.graph_notice_id]),
  );
  if (compatibilityByUrl.size > 0) {
    const { data, error } = await supabase
      .from("crawled_notices")
      .select("id, notice_url")
      .in("notice_url", [...compatibilityByUrl.keys()]);
    if (error) throw new Error(`Compatibility link readback failed: ${error.message}`);
    for (const row of data ?? []) {
      const graphNoticeId = compatibilityByUrl.get(row.notice_url);
      const { error: linkError } = await supabase
        .from("ingestion_notices")
        .update({ legacy_crawled_notice_id: row.id })
        .eq("id", graphNoticeId);
      if (linkError) throw new Error(`Compatibility link update failed: ${linkError.message}`);
    }
  }
  return attempted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  const rollbackRunId = typeof args["rollback-run"] === "string" ? args["rollback-run"] : null;
  const inputPath = args.input ?? DEFAULT_INPUT;
  const outputPath = args.output ?? DEFAULT_OUTPUT;
  const rawInput = normalizePilotInput(readJson(inputPath));

  if (!apply && !rollbackRunId) {
    const guard = assertPostPhaseLTarget(
      {
        POST_PHASE_L_TARGET_PROJECT_REF,
        NEXT_PUBLIC_SUPABASE_URL: POST_PHASE_L_TARGET_PROJECT_URL,
      },
      { requireApply: false },
    );
    const inventory = readJson(args.inventory ?? DEFAULT_INVENTORY);
    const input = localResolve(rawInput, inventory);
    const plan = buildNormalizedGraphPlan(input, {
      targetProjectRef: POST_PHASE_L_TARGET_PROJECT_REF,
    });
    const report = {
      generated_at: new Date().toISOString(),
      stage: "pre_apply_dry_run",
      dry_run: true,
      remote_read_performed: false,
      remote_write_performed: false,
      target_project_ref: guard.target_project_ref,
      target_project_ref_match: guard.target_project_ref_match,
      production_ref_detected: guard.production_ref_detected,
      source_keys: input.source_results.map((row) => row.source_key),
      graph_counts: summarizeGraphPlan(plan),
      plan,
    };
    const resolvedOutput = writeJson(outputPath, report);
    console.log("post_phase_l_dry_run=true");
    console.log("remote_read_performed=false");
    console.log("remote_write_performed=false");
    console.log(`report=${resolvedOutput}`);
    return;
  }

  loadLocalEnvironment();
  const guard = assertPostPhaseLTarget(process.env, {
    requireApply: true,
    additionalInputs: process.argv.slice(2),
  });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for approved apply");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(guard.target_project_url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (rollbackRunId) {
    const { data, error } = await supabase.rpc("post_phase_l_rollback_run", {
      p_run_id: rollbackRunId,
      p_confirmation: "ROLLBACK_POST_PHASE_L_RUN",
    });
    if (error) throw new Error(`Bounded rollback failed: ${error.message}`);
    writeJson(outputPath, {
      generated_at: new Date().toISOString(),
      stage: "approved_bounded_rollback",
      target_project_ref: guard.target_project_ref,
      production_ref_detected: false,
      result: data,
    });
    console.log("bounded_rollback_completed=true");
    return;
  }

  const input = await remoteResolve(rawInput, supabase);
  const plan = buildNormalizedGraphPlan(input, {
    targetProjectRef: guard.target_project_ref,
  });
  const attempted = await applyGraphPlan(supabase, plan);
  const report = {
    generated_at: new Date().toISOString(),
    stage: "approved_l_project_apply",
    dry_run: false,
    target_project_ref: guard.target_project_ref,
    target_project_ref_match: guard.target_project_ref_match,
    production_ref_detected: false,
    environment_values_printed: false,
    source_keys: input.source_results.map((row) => row.source_key),
    graph_counts: summarizeGraphPlan(plan),
    attempted_rows: attempted,
    run_id: plan.tables.ingestion_crawl_runs[0].id,
    external_llm_call_count: 0,
    automatic_public_publish_count: 0,
  };
  const resolvedOutput = writeJson(outputPath, report);
  console.log("post_phase_l_apply_completed=true");
  console.log("production_ref_detected=false");
  console.log("environment_values_printed=false");
  console.log(`report=${resolvedOutput}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
