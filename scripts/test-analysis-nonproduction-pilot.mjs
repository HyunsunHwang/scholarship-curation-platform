import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const reportPath = "/tmp/analysis-nonproduction-pilot-test.json";
const run = spawnSync(process.execPath, [
  "scripts/run-analysis-nonproduction-pilot.mjs",
  "--stage", "preflight",
  "--out", reportPath,
], {
  encoding: "utf8",
  env: {
    PATH: process.env.PATH,
    NEXT_PUBLIC_SUPABASE_URL: "https://synwudnxdkybwihwmtak.supabase.co",
  },
});
assert.equal(run.status, 2);
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
assert.equal(report.status, "blocked");
assert.equal(report.target_environment.production_ref_detected, true);
assert.equal(report.safety.production_db_access, 0);
assert.equal(report.safety.production_db_write, 0);
assert.equal(report.safety.secrets_committed_or_printed, false);
assert.equal(report.preflight.local_file_inventory.verify_analysis_pilot, true);
assert.ok(report.blockers.includes("forbidden_production_ref_detected"));
assert.ok(report.blockers.includes("credential_missing:POST_PHASE_L_TARGET_PROJECT_REF"));

const source = fs.readFileSync("scripts/run-analysis-nonproduction-pilot.mjs", "utf8");
assert.match(source, /Math\.min\(Number\(options\.limit \?\? 5\), 5\)/);
assert.match(source, /Math\.min\(Number\(options\["max-runs"\] \?\? 10\), 10\)/);
assert.match(source, /allow-nonproduction-db-write/);
assert.match(source, /allow-db-queue/);
assert.match(source, /allow-live-provider/);
assert.doesNotMatch(source, /console\.log\(process\.env/);
const verificationSql = fs.readFileSync(
  "supabase/post-phase-l/verify_analysis_nonproduction_pilot.sql",
  "utf8",
);
assert.match(verificationSql, /begin transaction read only/i);
assert.match(verificationSql, /notice_analysis_routing_decisions/);
assert.match(verificationSql, /run_role_present/);
assert.match(verificationSql, /budget_deferred_allowed/);
assert.match(verificationSql, /public_finalize_execute_revoked/);
assert.match(verificationSql, /anon_finalize_execute_revoked/);
assert.match(verificationSql, /authenticated_finalize_execute_revoked/);
assert.match(verificationSql, /service_role_finalize_execute_granted/);
assert.match(source, /010_finalize_routing_privilege_hardening\.sql/);
assert.match(verificationSql, /rollback;/i);
console.log("analysis_nonproduction_pilot_contract=pass");
