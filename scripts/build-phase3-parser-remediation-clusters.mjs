import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhase3RemediationClusters } from "../lib/crawler-engine/runtime-diagnostics/phase3-remediation-clustering.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function evidenceRows(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort()
    .map((name) => readJson(path.join(directory, name)));
}

export function writePhase3RemediationClusters({ baselinePath, evidenceDirectory, outputPath }) {
  const output = buildPhase3RemediationClusters({
    baseline: readJson(baselinePath),
    sameCaptureEvidence: evidenceRows(evidenceDirectory),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , baselinePath, evidenceDirectory, outputPath] = process.argv;
  if (!baselinePath || !evidenceDirectory || !outputPath) {
    throw new Error("Usage: node scripts/build-phase3-parser-remediation-clusters.mjs <baseline.json> <same-capture-evidence-dir> <output.json>");
  }
  const output = writePhase3RemediationClusters({
    baselinePath: path.resolve(baselinePath), evidenceDirectory: path.resolve(evidenceDirectory), outputPath: path.resolve(outputPath),
  });
  console.log(`targets=${output.target_count}`);
  console.log(`clustered_sources=${output.summary.clustered_source_count}`);
  console.log(`capture_required_sources=${output.summary.capture_required_source_count}`);
}
