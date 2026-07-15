import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { POST_PHASE_L_PILOT_SOURCE_KEYS } from "../lib/post-phase-l/normalized-graph.mjs";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";

const __filename = fileURLToPath(import.meta.url);

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

function boundedInteger(value, fallback, min, max, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function selectSources(args) {
  const hasSingle = typeof args.source === "string";
  const hasCohort = args.cohort === true;
  if (hasSingle === hasCohort) {
    throw new Error("Choose exactly one of --source <pilot-source-key> or --cohort");
  }
  if (hasSingle) {
    if (!POST_PHASE_L_PILOT_SOURCE_KEYS.includes(args.source)) {
      throw new Error(`Source is outside the Post-Phase L pilot: ${args.source}`);
    }
    return [args.source];
  }
  return [...POST_PHASE_L_PILOT_SOURCE_KEYS];
}

function runNode(scriptPath, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} failed: code=${code} signal=${signal ?? "none"}`));
    });
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply !== true) {
    throw new Error("Post-Phase L pilot execution requires the explicit --apply flag");
  }

  loadLocalEnvironment();
  const guard = assertPostPhaseLTarget(process.env, {
    requireApply: true,
    additionalInputs: process.argv.slice(2),
  });
  const sources = selectSources(args);
  const maxItems = boundedInteger(args["max-items"], 10, 1, 20, "max-items");
  const maxPages = boundedInteger(args["max-pages"], 2, 1, 5, "max-pages");
  const lookbackDays = boundedInteger(args["lookback-days"], 730, 1, 3650, "lookback-days");
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = sources.length === 1 ? sources[0] : "cohort";
  const runDirectory = path.resolve("reports", "post-phase-l-live", `${runStamp}-${label}`);
  const crawlerDirectory = path.join(runDirectory, "crawler");
  const statePath = path.join(runDirectory, "state.json");
  const crawlerReportPath = path.join(crawlerDirectory, "scholarship-notices-latest.json");
  const applyReportPath = path.join(runDirectory, "apply-report.json");
  const orchestrationReportPath = path.join(runDirectory, "orchestration.json");
  fs.mkdirSync(runDirectory, { recursive: true });

  const childEnv = {
    ...process.env,
    CRAWL_SOURCE_ID_ALLOWLIST: sources.join(","),
    CRAWL_MAX_ITEMS_PER_SOURCE: String(maxItems),
    CRAWL_MAX_PAGES_PER_SOURCE: String(maxPages),
    CRAWL_LOOKBACK_DAYS: String(lookbackDays),
    CRAWL_SOURCE_CONCURRENCY: "1",
    CRAWL_IGNORE_SEEN: "true",
    CRAWL_DETAIL_FETCH: "true",
    CRAWL_ALLOW_UNDATED: "false",
  };

  await runNode(
    path.resolve("scripts/crawl-scholarship-notices.mjs"),
    ["db", crawlerDirectory, statePath],
    childEnv,
  );

  const crawlerReport = readJson(crawlerReportPath);
  const observedSources = (crawlerReport.perSource ?? []).map((row) => row.sourceId).sort();
  const expectedSources = [...sources].sort();
  if (JSON.stringify(observedSources) !== JSON.stringify(expectedSources)) {
    throw new Error("Crawler source cohort differs from the approved exact allowlist");
  }
  if ((crawlerReport.totals?.sourceCount ?? 0) !== sources.length) {
    throw new Error("Crawler source count differs from the approved bounded cohort");
  }

  await runNode(
    path.resolve("scripts/ingest-post-phase-l.mjs"),
    ["--apply", "--input", crawlerReportPath, "--output", applyReportPath],
    childEnv,
  );

  const applyReport = readJson(applyReportPath);
  writeJson(orchestrationReportPath, {
    generated_at: new Date().toISOString(),
    stage: "approved_bounded_pilot_orchestration",
    target_project_ref: guard.target_project_ref,
    target_project_ref_match: guard.target_project_ref_match,
    production_ref_detected: false,
    production_read_performed: false,
    production_write_performed: false,
    l_project_remote_read_performed: true,
    l_project_remote_write_performed: true,
    source_keys: sources,
    source_count: sources.length,
    max_items_per_source: maxItems,
    max_pages_per_source: maxPages,
    lookback_days: lookbackDays,
    crawler_totals: crawlerReport.totals,
    per_source: crawlerReport.perSource,
    graph_counts: applyReport.graph_counts,
    run_id: applyReport.run_id,
    external_llm_call_count: 0,
    automatic_public_publish_count: 0,
    environment_values_printed: false,
  });

  console.log(`post_phase_l_pilot_sources=${sources.length}`);
  console.log(`post_phase_l_run_id=${applyReport.run_id}`);
  console.log(`report=${orchestrationReportPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
