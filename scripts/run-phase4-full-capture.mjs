import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePhase4PrivateArtifactRoot } from "../lib/crawler-engine/runtime-diagnostics/phase4-private-artifact-retention.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2); const value = (name) => { const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1]; };
const privateRoot = value("--private-artifact-root") ?? process.env.PHASE4_PRIVATE_ARTIFACT_ROOT; const checkpoint = value("--checkpoint");
if (!privateRoot || !checkpoint) throw new Error("Phase 4 full capture requires --private-artifact-root and --checkpoint.");
validatePhase4PrivateArtifactRoot({ repositoryRoot: root, privateArtifactRoot: path.resolve(root, privateRoot), runIdentity: "phase4-full-capture-preflight" });
const error = new Error("phase4_full_capture_not_enabled: this commit only prepares the fail-closed preflight and never starts network capture."); error.code = "phase4_full_capture_not_enabled"; throw error;
