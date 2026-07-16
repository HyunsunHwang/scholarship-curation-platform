import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyMergeReadiness,
  collectGitReadiness,
} from "../../lib/post-phase-n-q/git-readiness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportPath = path.join(ROOT, "reports", "post-phase-n-q", "final-merge-readiness.json");
const gitReadiness = collectGitReadiness({ cwd: ROOT });
const mergeReadiness = classifyMergeReadiness(gitReadiness);
const report = {
  contract_version: "post-phase-n-q-final-merge-readiness/v2",
  report_generated_at: new Date().toISOString(),
  status: mergeReadiness.pr_creation_readiness === "PASS" ? "PASS" : "HOLD",
  git_readiness: gitReadiness,
  ...mergeReadiness,
  production_fingerprint: "PASS_OWNER_READ_ONLY",
  migration_readiness: "HOLD",
  production_migration: "NOT_AUTHORIZED",
  canary_write: "NOT_AUTHORIZED",
  canary_rollout: "HOLD",
  public_beta: "HOLD",
  safety: {
    production_access_performed: false,
    production_read_performed: false,
    production_write_performed: false,
    production_execute_count: 0,
  },
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
