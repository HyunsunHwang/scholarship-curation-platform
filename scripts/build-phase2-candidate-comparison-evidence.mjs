import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhase2CandidateComparison } from "../lib/crawler-engine/runtime-diagnostics/phase2-candidate-comparison.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

export function writePhase2CandidateComparisonEvidence({ sourceId, controlPath, treatmentPath, outputPath }) {
  const evidence = buildPhase2CandidateComparison({
    sourceId,
    control: readJson(controlPath),
    treatment: readJson(treatmentPath),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidence;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , sourceId, controlPath, treatmentPath, outputPath] = process.argv;
  if (!sourceId || !controlPath || !treatmentPath || !outputPath) {
    throw new Error("Usage: node scripts/build-phase2-candidate-comparison-evidence.mjs <sourceId> <control.json> <treatment.json> <output.json>");
  }
  const evidence = writePhase2CandidateComparisonEvidence({
    sourceId,
    controlPath: path.resolve(controlPath),
    treatmentPath: path.resolve(treatmentPath),
    outputPath: path.resolve(outputPath),
  });
  console.log(`source_id=${evidence.source_id}`);
  console.log(`candidate_recall_verified=${evidence.candidate_recall_verified}`);
}
