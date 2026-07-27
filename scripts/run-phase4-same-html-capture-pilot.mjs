import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";
import { runPhase4SameHtmlCapture } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-orchestration.mjs";

// Deliberately varied list contracts: table/query, KBoard, event-handler, generic,
// likely inline/external, API-backed SPA, and a known externally problematic source.
export const PHASE4_PILOT_SOURCES = Object.freeze([
  { sourceId: "hanyang_011", rationale: "table-row list with query-parameter identity" },
  { sourceId: "uos_001", rationale: "KBoard-style query identity (mod=document and uid)" },
  { sourceId: "cau_003", rationale: "legacy list with event-handler / nonstandard link evidence" },
  { sourceId: "cau_004", rationale: "heuristic-anchor baseline target" },
  { sourceId: "cau_013", rationale: "inline or externally constrained list candidate" },
  { sourceId: "korea_033", rationale: "SPA/API-backed board contract" },
  { sourceId: "skku_042", rationale: "path-segment detail identity candidate" },
  { sourceId: "korea_060", rationale: "inline-notice structural candidate" },
  { sourceId: "hanyang_014", rationale: "known externally problematic list endpoint" },
]);

function parseArgs(argv) {
  const values = { outputDirectory: null, resume: false, checkpointPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--resume") values.resume = true;
    else if (value === "--checkpoint") values.checkpointPath = argv[++index] ?? null;
    else if (!values.outputDirectory) values.outputDirectory = value;
    else throw new Error(`Unknown Phase 4 pilot argument: ${value}`);
  }
  if (!values.outputDirectory) throw new Error("Usage: node scripts/run-phase4-same-html-capture-pilot.mjs <output-directory> [--resume] [--checkpoint <path>]");
  return values;
}

async function writeNewJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

function pilotSources(registry) {
  const byId = new Map(registry.sources.map((source) => [source.sourceId, source]));
  const sourceIds = PHASE4_PILOT_SOURCES.map((item) => item.sourceId);
  const missing = sourceIds.filter((sourceId) => !byId.has(sourceId));
  if (missing.length > 0) throw new Error(`Pilot Source IDs are missing from the enabled manifest: ${missing.join(", ")}`);
  return sourceIds.map((sourceId) => byId.get(sourceId));
}

/** Read-only, one-list-fetch-per-source Phase 4 pilot. Artifacts are create-only. */
export async function runPhase4CapturePilot({
  outputDirectory, resume = false, checkpointPath = null,
  loadRegistry = loadNoticeSourceManifestRegistry,
  captureRunner = runPhase4SameHtmlCapture,
} = {}) {
  const directory = path.resolve(outputDirectory);
  const summaryName = resume ? "phase4-pilot-resume-summary.json" : "phase4-pilot-summary.json";
  if (!resume && await exists(directory)) {
    throw new Error(`Phase 4 pilot output directory already exists; use a new directory or --resume: ${directory}`);
  }
  if (resume && await exists(path.join(directory, summaryName))) {
    throw new Error(`Phase 4 pilot resume summary already exists and will not be overwritten: ${path.join(directory, summaryName)}`);
  }
  const registry = loadRegistry();
  const sources = pilotSources(registry);
  const checkpoint = checkpointPath ? path.resolve(checkpointPath) : path.join(directory, "phase4-capture-checkpoint.json");
  const result = await captureRunner({
    sources,
    transportPolicySources: registry.sources,
    sourceRegistry: registry.fingerprint,
    checkpointPath: checkpoint,
    resume,
    sourceConcurrency: 2,
    hostConcurrency: 1,
    timeoutMs: 25_000,
    retryCount: 1,
    onResult: async (row) => {
      if (row.capture_status === "resume_skipped") return;
      await writeNewJson(path.join(directory, "captures", `${row.source_id}.json`), row);
    },
  });
  await writeNewJson(path.join(directory, summaryName), {
    ...result,
    pilot_sources: PHASE4_PILOT_SOURCES,
    capture_contract: {
      list_fetches_per_source: 1,
      control: "historical_baseline_parser_config_when_available",
      treatment: "current_branch_parser_config",
      historical_control_absent: "historical_control_reconciliation",
      artifact_write_mode: "create_only",
    },
  });
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = await runPhase4CapturePilot(args);
  console.log(`pilot_sources=${result.source_count}`);
  console.log(`capture_success=${result.results.filter((row) => row.capture_status === "capture_success").length}`);
  console.log(`checkpoint=${args.checkpointPath ?? path.join(path.resolve(args.outputDirectory), "phase4-capture-checkpoint.json")}`);
}
