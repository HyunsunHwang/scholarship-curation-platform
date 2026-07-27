import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhase2SameHtmlComparison } from "../lib/crawler-engine/runtime-diagnostics/phase2-same-html-comparison.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

export function writePhase2SameHtmlComparison({ sourceId, capturePath, controlPath, treatmentPath, outputPath }) {
  const capture = readJson(capturePath);
  if (sourceId !== capture.source_id) throw new Error("CLI sourceId must match capture source_id.");
  const result = buildPhase2SameHtmlComparison({
    capture,
    controlConfig: readJson(controlPath),
    treatmentConfig: readJson(treatmentPath),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , sourceId, capturePath, controlPath, treatmentPath, outputPath] = process.argv;
  if (!sourceId || !capturePath || !controlPath || !treatmentPath || !outputPath) {
    throw new Error("Usage: node scripts/build-phase2-same-html-comparison.mjs <sourceId> <capture.json> <control-config.json> <treatment-config.json> <output.json>");
  }
  const result = writePhase2SameHtmlComparison({
    sourceId,
    capturePath: path.resolve(capturePath),
    controlPath: path.resolve(controlPath),
    treatmentPath: path.resolve(treatmentPath),
    outputPath: path.resolve(outputPath),
  });
  console.log(`source_id=${result.source_id}`);
  console.log(`html_sha256=${result.capture.html_sha256}`);
  console.log(`candidate_recall_verified=${result.candidate_comparison.candidate_recall_verified}`);
}
