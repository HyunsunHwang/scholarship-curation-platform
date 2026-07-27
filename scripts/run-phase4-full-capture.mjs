import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPhase4FullCaptureDryRun } from "../lib/crawler-engine/runtime-diagnostics/phase4-full-capture-dry-run.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2); const value = (name) => { const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1]; };
const privateRoot = value("--private-artifact-root") ?? process.env.PHASE4_PRIVATE_ARTIFACT_ROOT; const checkpoint = value("--checkpoint"); const readiness = value("--readiness-report"); const runIdentity = value("--run-identity");
if (!privateRoot || !checkpoint || !readiness || !runIdentity) throw new Error("Phase 4 full capture requires private root, checkpoint, readiness report, and run identity.");
const dryRun = buildPhase4FullCaptureDryRun({ repositoryRoot: root, privateArtifactRoot: path.resolve(root, privateRoot), checkpoint: path.resolve(root, checkpoint), readinessReportPath: path.resolve(root, readiness), runIdentity, globalConcurrency: Number(value("--global-concurrency") ?? 4), hostConcurrency: Number(value("--host-concurrency") ?? 2), requestTimeoutMs: Number(value("--request-timeout-ms") ?? 25000), retryCount: Number(value("--retry-count") ?? 1) });
console.log(JSON.stringify(dryRun, null, 2));
if (argv.includes("--execute-live-capture")) { const error = new Error("phase4_full_capture_execution_not_released"); error.code = "phase4_full_capture_execution_not_released"; throw error; }
