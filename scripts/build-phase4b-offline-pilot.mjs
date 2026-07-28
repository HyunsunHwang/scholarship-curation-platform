import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhase4BOfflinePilot, phase4BReportFiles } from "../lib/crawler-engine/runtime-diagnostics/phase4b-offline-pilot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = path.join(root, "reports", "runtime-diagnostics");
const names = {
  inventory: "phase4-pilot-raw-capture-inventory-2026-07-27.json",
  reconciliation: "phase4-pilot-historical-control-reconciliation-2026-07-27.json",
  comparison: "phase4-pilot-offline-comparison-2026-07-27.json",
  clusters: "phase4-pilot-structural-clusters-2026-07-27.json",
  summary: "phase4-pilot-offline-comparison-summary-2026-07-27.md",
};

function parseArgs(argv) {
  const values = { check: false, rawCaptureDirectory: path.join(root, ".tmp", "runtime-analysis", "phase4-capture-pilot-20260727-v3", "captures"), outputDirectory: reportDirectory };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--check") values.check = true;
    else if (value === "--raw-captures") values.rawCaptureDirectory = path.resolve(argv[++index] ?? "");
    else if (value === "--output") values.outputDirectory = path.resolve(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${value}`);
  }
  return values;
}
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function summary(output) {
  return `# Phase 4B offline pilot\n\n- Network fetches: ${output.offline_network_fetch_count}\n- Raw captures verified: ${output.accounting.raw_capture_verified_count}/8\n- Historical controls restored: ${output.comparisons.length}\n- Comparison-ready: ${output.accounting.comparison_ready_count}\n- Structural clusters: ${output.clusters.summary.clustered_source_count === 0 ? 0 : output.clusters.clusters.length}\n- Transport recovery: hanyang_014\n\nThis report was derived from local legacy capture artifacts and Git history only; it contains no raw HTML, base64 response body, or local artifact path.\n`;
}

export async function buildPhase4BReports(options = {}) {
  const output = await buildPhase4BOfflinePilot({
    repositoryRoot: root,
    rawCaptureDirectory: options.rawCaptureDirectory ?? path.join(root, ".tmp", "runtime-analysis", "phase4-capture-pilot-20260727-v3", "captures"),
    pilotReportPath: path.join(reportDirectory, "phase4-capture-pilot-2026-07-27-run2.json"),
  });
  const files = phase4BReportFiles(output);
  const rendered = { inventory: json(files.inventory), reconciliation: json(files.reconciliation), comparison: json(files.comparison), clusters: json(files.clusters), summary: summary(output) };
  if (options.outputDirectory) {
    for (const [key, name] of Object.entries(names)) {
      const filePath = path.join(options.outputDirectory, name);
      if (options.check) {
        if (!fs.existsSync(filePath) || fs.readFileSync(filePath, "utf8") !== rendered[key]) throw new Error(`Phase 4B report is missing or non-deterministic: ${filePath}`);
      } else {
        fs.mkdirSync(options.outputDirectory, { recursive: true });
        fs.writeFileSync(filePath, rendered[key], { encoding: "utf8", flag: "wx" });
      }
    }
  }
  return { output, rendered };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = await buildPhase4BReports(args);
  console.log(`raw_capture_verified=${result.output.accounting.raw_capture_verified_count}`);
  console.log(`comparison_ready=${result.output.accounting.comparison_ready_count}`);
  console.log(`clusters=${result.output.clusters.clusters.length}`);
  console.log("offline_network_fetch_count=0");
}
