import fs from "node:fs";
import path from "node:path";
import { diffFingerprints } from "../../lib/post-phase-n-q/fingerprint.mjs";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const productionPath = args[0] ?? "fixtures/post-phase-n-q/production-fingerprint.synthetic.json";
const nonproductionPath =
  args[1] ?? "reports/post-phase-n-q/nonproduction-fingerprint.json";
const outputPath =
  args[2] ?? "reports/post-phase-n-q/schema-diff.json";
const productionEvidenceAvailable = !productionPath.includes(".synthetic.");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT, file), "utf8"));
}

const target = readJson("fixtures/post-phase-n-q/beta-schema-target.json");
const result = diffFingerprints({
  production: readJson(productionPath),
  nonproduction: readJson(nonproductionPath),
  target,
  productionEvidenceAvailable,
});
const resolved = path.resolve(ROOT, outputPath);
fs.mkdirSync(path.dirname(resolved), { recursive: true });
fs.writeFileSync(resolved, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  passed: result.arithmetic_consistent,
  status: result.status,
  difference_count: result.difference_count,
  output_path: path.relative(ROOT, resolved).replaceAll("\\", "/"),
  production_evidence_available: result.production_fingerprint_available,
}, null, 2));
if (!result.arithmetic_consistent) process.exitCode = 1;
