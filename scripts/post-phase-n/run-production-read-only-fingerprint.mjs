import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertProductionReadGate,
  PRODUCTION_PROJECT_REF,
} from "../../lib/post-phase-n-q/safety.mjs";

const ROOT = process.cwd();
const SQL_PATH = path.join(
  ROOT,
  "supabase/post-phase-n-q/001_production_read_only_fingerprint.sql",
);
const OUTPUT_PATH = path.join(
  ROOT,
  "reports/post-phase-n-q/production-fingerprint-owner-output.txt",
);

if (typeof process.loadEnvFile === "function") {
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

assertProductionReadGate(process.env);
if (!fs.existsSync(SQL_PATH)) {
  throw new Error("Production fingerprint SQL package is missing");
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
const childEnv = {
  ...process.env,
  PGDATABASE: process.env.POST_PHASE_N_PRODUCTION_DATABASE_URL,
  PGCONNECT_TIMEOUT: "10",
};
delete childEnv.POST_PHASE_N_PRODUCTION_DATABASE_URL;

const result = spawnSync(
  "psql",
  [
    "--no-psqlrc",
    "--quiet",
    "--tuples-only",
    "--no-align",
    "--set=ON_ERROR_STOP=1",
    "--file",
    SQL_PATH,
    "--output",
    OUTPUT_PATH,
  ],
  {
    cwd: ROOT,
    env: childEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(
    `Production read-only fingerprint failed without exposing credentials: ${String(result.stderr).trim()}`,
  );
}

console.log(JSON.stringify({
  passed: true,
  project_ref: PRODUCTION_PROJECT_REF,
  read_only: true,
  production_write_performed: false,
  output_path: path.relative(ROOT, OUTPUT_PATH).replaceAll("\\", "/"),
  credentials_printed: false,
}, null, 2));
