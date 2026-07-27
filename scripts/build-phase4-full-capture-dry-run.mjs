import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhase4FullCaptureDryRun } from "../lib/crawler-engine/runtime-diagnostics/phase4-full-capture-dry-run.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); const privateRoot = path.join(root, ".tmp", "phase4-private-artifacts"); const runIdentity = "phase4-full-dry-run-20260727";
const result = buildPhase4FullCaptureDryRun({ repositoryRoot: root, privateArtifactRoot: privateRoot, checkpoint: path.join(privateRoot, "phase4-capture", runIdentity, "checkpoint.json"), readinessReportPath: path.join(root, "reports/runtime-diagnostics/phase4c-readiness-closeout-2026-07-27-run2.json"), runIdentity });
const report = path.join(root, "reports/runtime-diagnostics/phase4-full-capture-dry-run-2026-07-27.json"); fs.writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); fs.writeFileSync(path.join(root, "reports/runtime-diagnostics/phase4-full-capture-dry-run-2026-07-27.md"), `# Phase 4 full-capture dry run\n\n- Targets: ${result.target_inventory.target_source_count}\n- Network fetches: 0\n- Ready to execute: ${result.ready_to_execute}\n- Live release: disabled\n`, { flag: "wx" });
