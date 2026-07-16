import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildScopedMigrationReadiness } from "../../lib/post-phase-n-q/scoped-migration-diff.mjs";

const ROOT = process.cwd();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function buildOwnerScopedMigrationReadiness({
  productionPath,
  nonproductionPath,
  targetPath,
  sanitizedOutputPath,
  localFullOutputPath,
}) {
  const resolvedFullOutputPath = path.resolve(localFullOutputPath);
  const relativeFullOutputPath = path.relative(ROOT, resolvedFullOutputPath);
  if (!relativeFullOutputPath.startsWith("..")) {
    throw new Error("Full owner schema diff must stay outside the repository");
  }
  const result = buildScopedMigrationReadiness({
    production: readJson(productionPath),
    nonproduction: readJson(nonproductionPath),
    target: readJson(targetPath),
  });
  writeJson(sanitizedOutputPath, result.sanitized_summary);
  writeJson(resolvedFullOutputPath, result.full_diff);
  return result.sanitized_summary;
}

function main() {
  const [productionArg, nonproductionArg, targetArg, sanitizedArg, fullArg] =
    process.argv.slice(2);
  if (!productionArg || !nonproductionArg || !targetArg || !sanitizedArg || !fullArg) {
    throw new Error(
      "Usage: node scripts/post-phase-n/build-owner-scoped-migration-readiness.mjs <production-fingerprint-path> <nonproduction-fingerprint-path> <target-path> <sanitized-output-path> <local-full-output-path>",
    );
  }
  const summary = buildOwnerScopedMigrationReadiness({
    productionPath: path.resolve(ROOT, productionArg),
    nonproductionPath: path.resolve(ROOT, nonproductionArg),
    targetPath: path.resolve(ROOT, targetArg),
    sanitizedOutputPath: path.resolve(ROOT, sanitizedArg),
    localFullOutputPath: path.resolve(ROOT, fullArg),
  });
  console.log(
    JSON.stringify(
      {
        migration_readiness: summary.migration_readiness,
        blocker_count: summary.blocker_count,
        output_path: path.relative(ROOT, path.resolve(ROOT, sanitizedArg)).replaceAll("\\", "/"),
      },
      null,
      2,
    ),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) main();
