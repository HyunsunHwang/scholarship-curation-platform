import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { POST_PHASE_M_SOURCE_KEYS } from "../lib/post-phase-m/controlled-cohort.mjs";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function boundedInteger(value, fallback, min, max, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return parsed;
}

function runNode(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(), env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(script)} failed: code=${code} signal=${signal ?? "none"}`));
    });
  });
}

function classifySource(row) {
  if (row.error) {
    return /tls|certificate|socket|timeout|fetch failed|econn/i.test(row.error)
      ? "blocked_transport"
      : "blocked_parser";
  }
  return row.matchedCount > 0 ? "success_attributable" : "zero_match_observed";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply !== true) throw new Error("Post-Phase M controlled pilot requires --apply");
  const cycle = boundedInteger(args.cycle, 0, 1, 2, "cycle");
  const maxItems = boundedInteger(args["max-items"], 30, 1, 30, "max-items");
  const maxPages = boundedInteger(args["max-pages"], 5, 1, 5, "max-pages");
  const lookbackDays = boundedInteger(args["lookback-days"], 730, 1, 3650, "lookback-days");
  loadLocalEnvironment();
  const guard = assertPostPhaseLTarget(process.env, { requireApply: true, additionalInputs: process.argv.slice(2) });
  const cycleDir = path.resolve("reports", "post-phase-m-live", `cycle-${cycle}`);
  const cycleReportPath = path.join(cycleDir, "cycle-report.json");
  if (fs.existsSync(cycleReportPath)) throw new Error(`Cycle evidence already exists: cycle-${cycle}`);
  fs.mkdirSync(cycleDir, { recursive: true });

  const resume = args.resume === true;
  let startedAt = new Date();
  const crawlerDir = path.join(cycleDir, "crawler");
  const crawlerReportPath = path.join(crawlerDir, "scholarship-notices-latest.json");
  const statePath = path.join(cycleDir, "state.json");
  const applyReportPath = path.join(cycleDir, "apply-report.json");
  const runtimeReportPath = path.join(cycleDir, "runtime-report.json");
  const childEnv = {
    ...process.env,
    CRAWL_SOURCE_ID_ALLOWLIST: POST_PHASE_M_SOURCE_KEYS.join(","),
    CRAWL_MAX_ITEMS_PER_SOURCE: String(maxItems),
    CRAWL_MAX_PAGES_PER_SOURCE: String(maxPages),
    CRAWL_LOOKBACK_DAYS: String(lookbackDays),
    CRAWL_SOURCE_CONCURRENCY: "1",
    CRAWL_IGNORE_SEEN: "true",
    CRAWL_DETAIL_FETCH: "true",
    CRAWL_ALLOW_UNDATED: "false",
  };

  if (!resume) {
    await runNode(path.resolve("scripts/crawl-scholarship-notices.mjs"), ["db", crawlerDir, statePath], childEnv);
  } else if (!fs.existsSync(crawlerReportPath)) {
    throw new Error(`Cannot resume cycle-${cycle}: crawler evidence is missing`);
  }
  const crawler = readJson(crawlerReportPath);
  if (resume && crawler.runAt) startedAt = new Date(crawler.runAt);
  const observedKeys = crawler.perSource.map((row) => row.sourceId).sort();
  if (JSON.stringify(observedKeys) !== JSON.stringify([...POST_PHASE_M_SOURCE_KEYS].sort())) {
    throw new Error("Cycle source results do not match the exact M allowlist");
  }
  crawler.idempotencyKey = `post-phase-m-controlled-cycle-${cycle}-v1`;
  writeJson(crawlerReportPath, crawler);
  await runNode(
    path.resolve("scripts/ingest-post-phase-l.mjs"),
    ["--apply", "--input", crawlerReportPath, "--output", applyReportPath],
    childEnv,
  );
  const applyReport = readJson(applyReportPath);
  await runNode(
    path.resolve("scripts/verify-post-phase-l-runtime.mjs"),
    [
      "--run-report", applyReportPath,
      "--allowed-source-keys", POST_PHASE_M_SOURCE_KEYS.join(","),
      "--output", runtimeReportPath,
    ],
    childEnv,
  );
  const runtime = readJson(runtimeReportPath);
  const finishedAt = new Date();
  const sourceResults = crawler.perSource.map((row) => ({
    source_key: row.sourceId,
    classification: classifySource(row),
    observed_count: row.crawledCount ?? 0,
    matched_count: row.matchedCount ?? 0,
    retry_count: row.retryCount ?? 0,
    error_code: row.error ? classifySource(row) : null,
    error_message: row.error || null,
    body_evidence_count: crawler.newNotices.filter((notice) => notice.sourceId === row.sourceId && (notice.content ?? "").trim()).length,
    asset_evidence_count: crawler.newNotices
      .filter((notice) => notice.sourceId === row.sourceId)
      .reduce((total, notice) => total + (notice.attachmentMetadata?.length ?? 0), 0),
  }));
  writeJson(cycleReportPath, {
    generated_at: finishedAt.toISOString(),
    contract_version: "post-phase-m-cycle/v1",
    cycle_id: `post-phase-m-cycle-${cycle}`,
    cycle_number: cycle,
    run_id: applyReport.run_id,
    idempotency_key: crawler.idempotencyKey,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    target_project_ref: guard.target_project_ref,
    source_allowlist: POST_PHASE_M_SOURCE_KEYS,
    source_count: POST_PHASE_M_SOURCE_KEYS.length,
    crawl_bounds: { max_items_per_source: maxItems, max_pages_per_source: maxPages, source_concurrency: 1, lookback_days: lookbackDays },
    source_results: sourceResults,
    cycle_source_results_complete: sourceResults.length === POST_PHASE_M_SOURCE_KEYS.length,
    crawler_totals: crawler.totals,
    graph_counts: runtime.graph_counts,
    new_notice_count: runtime.new_notice_count,
    new_occurrence_count: runtime.new_occurrence_count,
    new_revision_count: runtime.new_revision_count,
    duplicate_notice_count: runtime.duplicate_notice_count,
    duplicate_occurrence_count: runtime.duplicate_occurrence_count,
    duplicate_alias_count: runtime.duplicate_alias_count,
    exact_source_resolution_passed: runtime.exact_source_resolution_passed,
    fuzzy_source_match_count: 0,
    automatic_source_create_count: 0,
    public_leakage_count: runtime.public_leakage_count,
    automatic_public_publish_count: 0,
    production_ref_detected: false,
    production_read_performed: false,
    production_write_performed: false,
    non_production_remote_read_performed: true,
    non_production_remote_write_performed: true,
    external_llm_call_count: 0,
    passed: runtime.runtime_readback_passed && sourceResults.length === POST_PHASE_M_SOURCE_KEYS.length,
  });
  console.log(`post_phase_m_cycle=${cycle}`);
  console.log(`post_phase_m_cycle_passed=${runtime.runtime_readback_passed}`);
  console.log(`run_id=${applyReport.run_id}`);
  console.log(`report=${cycleReportPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => { console.error(error?.message ?? error); process.exitCode = 1; });
}
