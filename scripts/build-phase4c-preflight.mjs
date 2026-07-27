import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhase4CPreflight, renderPhase4CCloseoutMarkdown } from "../lib/crawler-engine/runtime-diagnostics/phase4c-preflight.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reports = path.join(root, "reports", "runtime-diagnostics");
function args(argv) { const out = { privateArtifactRoot: process.env.PHASE4_PRIVATE_ARTIFACT_ROOT ?? null, check: false }; for (let i = 0; i < argv.length; i += 1) { if (argv[i] === "--private-artifact-root") out.privateArtifactRoot = argv[++i]; else if (argv[i] === "--check") out.check = true; else throw new Error(`Unknown argument: ${argv[i]}`); } if (!out.privateArtifactRoot) throw new Error("--private-artifact-root or PHASE4_PRIVATE_ARTIFACT_ROOT is required."); return out; }
const options = args(process.argv.slice(2));
const result = await buildPhase4CPreflight({ repositoryRoot: root, privateArtifactRoot: path.resolve(root, options.privateArtifactRoot), rawCaptureDirectory: path.join(root, ".tmp/runtime-analysis/phase4-capture-pilot-20260727-v3/captures"), pilotReportPath: path.join(reports, "phase4-capture-pilot-2026-07-27-run2.json") });
const artifacts = [["phase4-private-artifact-retention-preflight-2026-07-27.json", `${JSON.stringify(result, null, 2)}\n`], ["phase4b-closeout-preflight-2026-07-27.json", `${JSON.stringify({ schema_version: result.schema_version, ready_for_87_capture: result.ready_for_87_capture, phase4b_closeout: result.phase4b_closeout, authority: result.authority, network_fetch_count: result.network_fetch_count }, null, 2)}\n`], ["phase4b-closeout-preflight-2026-07-27.md", renderPhase4CCloseoutMarkdown(result)]];
for (const [name, text] of artifacts) { const file = path.join(reports, name); if (options.check) { if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) throw new Error(`Preflight artifact differs: ${name}`); } else fs.writeFileSync(file, text, { flag: "wx" }); }
console.log(`ready_for_87_capture=${result.ready_for_87_capture}`); console.log("network_fetch_count=0");
