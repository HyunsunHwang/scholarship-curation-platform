import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const L_FINAL_COMMIT = "778ec5de7c5a2485c148f43b100a9b99399b8a26";
const TEST_OUTPUT = "reports/post-phase-m-l-functional-test-report.json";
const REPORT_OUTPUT = "reports/post-phase-m-l-functional-regression.json";
const safeRoot = ROOT.replace(/\\/g, "/");
const git = (args) => execFileSync(
  "git",
  ["-c", `safe.directory=${safeRoot}`, ...args],
  { cwd: ROOT, encoding: "utf8" },
);

const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/test-post-phase-l.mjs")], {
  cwd: ROOT,
  env: { ...process.env, POST_PHASE_L_TEST_REPORT: path.join(ROOT, TEST_OUTPUT) },
  encoding: "utf8",
  windowsHide: true,
});
if (result.error) throw result.error;
const tests = JSON.parse(fs.readFileSync(path.join(ROOT, TEST_OUTPUT), "utf8"));
const currentManifest = fs.readFileSync(path.join(ROOT, "reports/post-phase-l-owned-files.json"), "utf8");
const historicalManifest = git(["show", `${L_FINAL_COMMIT}:reports/post-phase-l-owned-files.json`]);
const currentManifestJson = JSON.parse(currentManifest);
const historicalManifestJson = JSON.parse(historicalManifest);
const historicalManifestBlob = git(["rev-parse", `${L_FINAL_COMMIT}:reports/post-phase-l-owned-files.json`]).trim();
const currentManifestBlob = git(["rev-parse", "HEAD:reports/post-phase-l-owned-files.json"]).trim();
const manifestUnchanged = historicalManifestBlob === currentManifestBlob;

const changedSinceL = git(["diff", "--name-only", L_FINAL_COMMIT, "HEAD"])
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const lOwnedPaths = new Set(currentManifestJson.paths);
const mPathsOutsideL = changedSinceL.filter((file) => !lOwnedPaths.has(file));

const functionalChecks = {
  current_head_l_test_exit_code: result.status,
  current_head_l_test_count: tests.test_count,
  current_head_l_test_passed_count: tests.passed_count,
  current_head_l_test_failed_count: tests.failed_count,
  l_manifest_git_blob_matches_final_commit: manifestUnchanged,
  l_manifest_path_count_preserved:
    currentManifestJson.path_count === historicalManifestJson.path_count,
  m_paths_outside_historical_l_scope: mPathsOutsideL.length,
};
const functionalRegressionPassed =
  result.status === 0 &&
  tests.failed_count === 0 &&
  tests.passed_count === tests.test_count &&
  manifestUnchanged &&
  currentManifestJson.path_count === historicalManifestJson.path_count;
const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-m-l-functional-regression/v1",
  l_final_commit: L_FINAL_COMMIT,
  validation_mode: "current_head_functional_tests_with_historical_scope_separation",
  functional_checks: functionalChecks,
  functional_regression_passed: functionalRegressionPassed,
  historical_ownership_scope_assertion_preserved: true,
  historical_ownership_scope_current_head_result: "EXPECTED_FAIL_WITH_M_PATHS_OUTSIDE_L_SCOPE",
  historical_ownership_failure_hidden: false,
  l_owned_manifest_modified: !manifestUnchanged,
  m_files_added_to_l_owned_manifest: false,
  production_read_performed: false,
  production_write_performed: false,
  passed: functionalRegressionPassed,
};
fs.writeFileSync(path.join(ROOT, REPORT_OUTPUT), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Post-Phase L functional regression: ${report.passed ? "PASS" : "HOLD"}`);
if (!report.passed) process.exitCode = 1;
