import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  buildProductionExecutionReceipt,
  enrichOptionalCatalogEvidence,
  parseFingerprintJson,
  parseJsonValue,
  validateProductionFingerprintDocument,
} from "../../lib/post-phase-n-q/production-fingerprint-runner.mjs";
import { assertProductionReadGate } from "../../lib/post-phase-n-q/safety.mjs";

const ROOT = process.cwd();
const SQL_PATH = path.join(
  ROOT,
  "supabase/post-phase-n-q/001_production_read_only_fingerprint.sql",
);
const OUTPUT_PATH = path.join(
  ROOT,
  "reports/post-phase-n-q/production-fingerprint-owner-output.json",
);
const RECEIPT_PATH = path.join(
  ROOT,
  "reports/post-phase-n-q/production-fingerprint-execution-receipt.json",
);

function loadEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

export function buildPsqlEnvironment(env) {
  const childEnv = {};
  for (const name of [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "ComSpec",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
    "PGSSLMODE",
    "PGSSLROOTCERT",
    "PGSSLCRL",
    "PGSSLCERT",
    "PGSSLKEY",
    "PGCHANNELBINDING",
  ]) {
    if (env[name] !== undefined) childEnv[name] = env[name];
  }
  childEnv.PGDATABASE = env.POST_PHASE_N_PRODUCTION_DATABASE_URL;
  childEnv.PGCONNECT_TIMEOUT = "10";
  return childEnv;
}

function executePsql(args, env, timeout = 120_000) {
  const result = spawnSync(
    "psql",
    [
      "--no-psqlrc",
      "--quiet",
      "--tuples-only",
      "--no-align",
      "--set=ON_ERROR_STOP=1",
      ...args,
    ],
    {
      cwd: ROOT,
      env: buildPsqlEnvironment(env),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    },
  );
  if (result.error) {
    throw new Error("psql could not be started");
  }
  if (result.status !== 0) {
    throw new Error(`psql exited with status ${result.status}`);
  }
  return String(result.stdout).trim();
}

function removeStaleEvidence() {
  for (const file of [OUTPUT_PATH, RECEIPT_PATH]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function runProductionFingerprint({
  env = process.env,
  execute = executePsql,
} = {}) {
  const guard = assertProductionReadGate(env);
  if (!fs.existsSync(SQL_PATH)) {
    throw new Error("Production fingerprint SQL package is missing");
  }
  removeStaleEvidence();

  const baseOutput = execute(["--file", SQL_PATH], env);
  const baseFingerprint = parseFingerprintJson(baseOutput);
  const enrichedFingerprint = enrichOptionalCatalogEvidence(
    baseFingerprint,
    (query) => parseJsonValue(execute(["--command", query], env, 45_000)),
  );
  const validation =
    validateProductionFingerprintDocument(enrichedFingerprint);
  if (!validation.passed || validation.production_write_performed) {
    throw new Error(
      `Production fingerprint output validation failed: ${validation.errors.join(", ")}`,
    );
  }

  const serialized = `${JSON.stringify(validation.normalized, null, 2)}\n`;
  const receipt = buildProductionExecutionReceipt({
    guard,
    fingerprint: validation.normalized,
    outputByteCount: Buffer.byteLength(serialized, "utf8"),
  });
  writeJson(OUTPUT_PATH, validation.normalized);
  writeJson(RECEIPT_PATH, receipt);
  return {
    receipt,
    output_path: path.relative(ROOT, OUTPUT_PATH).replaceAll("\\", "/"),
    receipt_path: path.relative(ROOT, RECEIPT_PATH).replaceAll("\\", "/"),
  };
}

async function main() {
  loadEnvironment();
  const result = runProductionFingerprint();
  console.log(
    JSON.stringify(
      {
        ...result.receipt,
        output_path: result.output_path,
        receipt_path: result.receipt_path,
      },
      null,
      2,
    ),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  await main();
}
