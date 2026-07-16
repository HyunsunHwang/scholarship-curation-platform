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

const ALLOWED_SSL_MODES = new Set([
  "disable",
  "allow",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
]);

function parseProductionDatabaseUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error("Production database connection URL is invalid");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Production database connection protocol is unsupported");
  }
  if (!url.hostname) {
    throw new Error("Production database connection hostname is missing");
  }

  let username;
  let password;
  let database;
  try {
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    const pathnameParts = url.pathname.split("/").filter(Boolean);
    database =
      pathnameParts.length === 1
        ? decodeURIComponent(pathnameParts[0])
        : "";
  } catch {
    throw new Error("Production database connection URL encoding is invalid");
  }
  if (!username) {
    throw new Error("Production database connection username is missing");
  }
  if (!password) {
    throw new Error("Production database connection password is missing");
  }
  if (!database) {
    throw new Error("Production database connection database name is missing");
  }

  const sslModes = url.searchParams.getAll("sslmode");
  if (
    sslModes.length > 1 ||
    (sslModes.length === 1 && !ALLOWED_SSL_MODES.has(sslModes[0]))
  ) {
    throw new Error("Production database connection sslmode is unsupported");
  }
  return {
    host: url.hostname,
    port: url.port || "5432",
    username,
    password,
    database,
    sslmode: sslModes[0] ?? "",
  };
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
  const connection = parseProductionDatabaseUrl(
    env.POST_PHASE_N_PRODUCTION_DATABASE_URL,
  );
  childEnv.PGHOST = connection.host;
  childEnv.PGPORT = connection.port;
  childEnv.PGUSER = connection.username;
  childEnv.PGPASSWORD = connection.password;
  childEnv.PGDATABASE = connection.database;
  if (connection.sslmode) childEnv.PGSSLMODE = connection.sslmode;
  childEnv.PGCONNECT_TIMEOUT = "10";
  return childEnv;
}

export function buildPsqlArguments(args) {
  return [
    "--no-psqlrc",
    "--quiet",
    "--tuples-only",
    "--no-align",
    "--set=ON_ERROR_STOP=1",
    ...args,
  ];
}

function executePsql(args, childEnv, timeout = 120_000) {
  const result = spawnSync(
    "psql",
    buildPsqlArguments(args),
    {
      cwd: ROOT,
      env: childEnv,
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
  removeStaleEvidence();
  const guard = assertProductionReadGate(env);
  if (!fs.existsSync(SQL_PATH)) {
    throw new Error("Production fingerprint SQL package is missing");
  }
  const psqlEnvironment = buildPsqlEnvironment(env);

  const baseOutput = execute(["--file", SQL_PATH], psqlEnvironment);
  const baseFingerprint = parseFingerprintJson(baseOutput);
  const enrichedFingerprint = enrichOptionalCatalogEvidence(
    baseFingerprint,
    (query) =>
      parseJsonValue(
        execute(["--command", query], psqlEnvironment, 45_000),
      ),
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
