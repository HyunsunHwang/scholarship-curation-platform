import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcilePhase4Evidence } from "../lib/crawler-engine/runtime-diagnostics/phase4-evidence-reconciliation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runIdentity = "phase4-capture-bce3990e0d29984b74eceeefc52d0238555f30ecf6fe486a915b9e286f1d6c40";
const contractFingerprint = "bce3990e0d29984b74eceeefc52d0238555f30ecf6fe486a915b9e286f1d6c40";
const args = process.argv.slice(2);
const runDirectory = path.resolve(root, args[0] ?? `.tmp/phase4-live-private-v3/phase4-capture/${runIdentity}`);
const output = path.resolve(root, args[1] ?? "reports/runtime-diagnostics/phase4-parser-evidence-gate-2026-07-28-run4.json");
const targets = JSON.parse(await fs.readFile(path.join(root, "reports/runtime-diagnostics/phase2-parser-remediation/target-sources.json"), "utf8"));
const report = await reconcilePhase4Evidence({
  runDirectory,
  expectedSourceIds: targets.targets.map((target) => target.source_id),
  runIdentity,
  contractFingerprint,
});
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ output: path.relative(root, output).replace(/\\/g, "/"), accounting: report.accounting }, null, 2));
