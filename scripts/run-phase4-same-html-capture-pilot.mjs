import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";
import { runPhase4SameHtmlCapture } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-orchestration.mjs";
import {
  PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION,
  validatePhase4ArtifactMetadata,
  validatePhase4CaptureArtifact,
} from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-artifact-validator.mjs";

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

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

export function resolveExpectedPhase4ArtifactPath({ runDirectory, sourceId } = {}) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(String(sourceId ?? ""))) { const error = new Error("Invalid Phase 4 artifact source ID."); error.code = "checkpoint_artifact_path_mismatch"; throw error; }
  const run = path.resolve(runDirectory); const captures = path.resolve(run, "captures"); const artifact = path.resolve(captures, `${sourceId}.json`);
  if (path.relative(run, captures) !== "captures" || path.relative(captures, artifact) !== `${sourceId}.json`) { const error = new Error("Phase 4 artifact path escapes its canonical capture directory."); error.code = "checkpoint_artifact_path_mismatch"; throw error; }
  return { runDirectory: run, capturesDirectory: captures, artifactPath: artifact };
}

async function assertNotSymlink(filePath, code) { if ((await fs.lstat(filePath)).isSymbolicLink()) { const error = new Error("Phase 4 artifact path may not be a symlink."); error.code = code; throw error; } }

export function createPhase4CaptureArtifactWriter(directory) {
  const root = path.resolve(directory);
  const artifactPathFor = (sourceId) => resolveExpectedPhase4ArtifactPath({ runDirectory: root, sourceId });
  return {
    async commit(artifact) {
      const { capturesDirectory, artifactPath: finalPath } = artifactPathFor(artifact.source_id);
      const temporaryPath = `${finalPath}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
      let handle = null;
      try {
        const canonical = validatePhase4CaptureArtifact(artifact, { expected: { sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint } });
        await fs.mkdir(capturesDirectory, { recursive: true }); await assertNotSymlink(root, "checkpoint_artifact_symlink"); await assertNotSymlink(capturesDirectory, "private_artifact_captures_symlink");
        handle = await fs.open(temporaryPath, "wx");
        await handle.writeFile(`${JSON.stringify(canonical, null, 2)}\n`, "utf8");
        await handle.sync(); await handle.close(); handle = null;
        try { await fs.link(temporaryPath, finalPath); } catch (error) { if (error?.code === "EEXIST") error.code = "artifact_already_exists"; throw error; }
        await fs.unlink(temporaryPath);
        const bytes = await fs.readFile(finalPath);
        const parsed = JSON.parse(bytes.toString("utf8"));
        validatePhase4CaptureArtifact(parsed, { expected: { sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint } });
        return { artifact_committed: true, artifact_path: finalPath, artifact_sha256: sha256(bytes) };
      } catch (error) {
        try { await handle?.close(); } catch {}
        try { await fs.unlink(temporaryPath); } catch {}
        error.code ??= error.message === "artifact_already_exists" ? "artifact_already_exists" : "artifact_commit_failure";
        throw error;
      }
    },
    async verify(metadata, expected) {
      try {
        const normalizedMetadata = validatePhase4ArtifactMetadata(metadata, expected);
        const { capturesDirectory, artifactPath } = artifactPathFor(expected.sourceId);
        if (path.resolve(normalizedMetadata.artifact_path) !== artifactPath) { const error = new Error("Artifact metadata path is not canonical."); error.code = "checkpoint_artifact_path_mismatch"; throw error; }
        await assertNotSymlink(root, "checkpoint_artifact_symlink"); await assertNotSymlink(capturesDirectory, "private_artifact_captures_symlink"); await assertNotSymlink(artifactPath, "checkpoint_artifact_symlink");
        const bytes = await fs.readFile(artifactPath);
        if (sha256(bytes) !== normalizedMetadata.artifact_sha256) return false;
        const artifact = JSON.parse(bytes.toString("utf8"));
        validatePhase4CaptureArtifact(artifact, { expected, metadata: normalizedMetadata });
        return true;
      } catch { return false; }
    },
    async recover({ sourceId, runIdentity, contractFingerprint }) {
      const { capturesDirectory, artifactPath: finalPath } = artifactPathFor(sourceId);
      try {
        await assertNotSymlink(root, "checkpoint_artifact_symlink"); await assertNotSymlink(capturesDirectory, "private_artifact_captures_symlink"); await assertNotSymlink(finalPath, "checkpoint_artifact_symlink");
        const bytes = await fs.readFile(finalPath);
        const artifact = JSON.parse(bytes.toString("utf8"));
        const canonical = validatePhase4CaptureArtifact(artifact, { expected: { sourceId, runIdentity, contractFingerprint } });
        return validatePhase4ArtifactMetadata({
          source_id: sourceId,
          capture_id: canonical.capture?.capture_id ?? null,
          capture_status: canonical.capture_status,
          evidence_status: canonical.evidence_status,
          next_phase_queue: canonical.next_phase_queue,
          blocking_reason: canonical.blocking_reason,
          artifact_status: "committed",
          artifact_path: finalPath,
          artifact_sha256: sha256(bytes),
          artifact_schema_version: PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION,
          capture_contract_version: canonical.capture_contract_version,
          run_identity: canonical.run_identity,
          contract_fingerprint: canonical.contract_fingerprint,
        }, { sourceId, runIdentity, contractFingerprint });
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
  };
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
    artifactWriter: createPhase4CaptureArtifactWriter(directory),
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
