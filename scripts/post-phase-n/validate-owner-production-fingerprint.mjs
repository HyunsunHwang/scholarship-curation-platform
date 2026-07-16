import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PRODUCTION_PROJECT_REF } from "../../lib/post-phase-n-q/safety.mjs";
import { validateOwnerProductionFingerprint } from "../../lib/post-phase-n-q/owner-evidence.mjs";

const ROOT = process.cwd();

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function runOwnerEvidenceValidation({
  fingerprintPath,
  receiptPath,
  sanitizedOutputPath,
}) {
  const result = validateOwnerProductionFingerprint({
    fingerprintPath,
    receiptPath,
    productionRef: PRODUCTION_PROJECT_REF,
  });
  writeJson(sanitizedOutputPath, result);
  return result;
}

function main() {
  const [fingerprintArg, receiptArg, outputArg] = process.argv.slice(2);
  if (!fingerprintArg || !receiptArg || !outputArg) {
    throw new Error(
      "Usage: node scripts/post-phase-n/validate-owner-production-fingerprint.mjs <fingerprint-path> <receipt-path> <sanitized-output-path>",
    );
  }
  const result = runOwnerEvidenceValidation({
    fingerprintPath: path.resolve(ROOT, fingerprintArg),
    receiptPath: path.resolve(ROOT, receiptArg),
    sanitizedOutputPath: path.resolve(ROOT, outputArg),
  });
  console.log(
    JSON.stringify(
      {
        passed: result.passed,
        output_path: path.relative(ROOT, path.resolve(ROOT, outputArg)).replaceAll("\\", "/"),
        canonical_hash_matches_legacy: result.canonical_hash_matches_legacy,
        credential_pattern_count: result.obvious_credential_pattern_count,
      },
      null,
      2,
    ),
  );
  if (!result.passed) process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) main();
