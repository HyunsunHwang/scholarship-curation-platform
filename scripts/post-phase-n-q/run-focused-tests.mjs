import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const commands = [
  ["N git readiness", "tests/post-phase-n/git-readiness.test.mjs"],
  ["N fingerprint", "tests/post-phase-n/fingerprint.test.mjs"],
  [
    "N production fingerprint runner",
    "tests/post-phase-n/production-fingerprint-runner.test.mjs",
  ],
  [
    "N owner evidence and scoped diff",
    "tests/post-phase-n/owner-evidence-and-scoped-diff.test.mjs",
  ],
  ["N migration plan", "tests/post-phase-n/migration-plan.test.mjs"],
  ["O projection", "tests/post-phase-o/projection.test.mjs"],
  ["O public contract", "tests/post-phase-o/public-contract.test.mjs"],
  ["P attachment", "tests/post-phase-p/attachments.test.mjs"],
  ["P semantic", "tests/post-phase-p/semantic.test.mjs"],
  ["P crawler date", "tests/post-phase-p/crawler-date.test.mjs"],
  ["P live source", "tests/post-phase-p/live-source.test.mjs"],
  ["Q operations", "tests/post-phase-q/operations.test.mjs"],
  ["Q UI regression", "tests/post-phase-q/ui-regression.test.mjs"],
  ["N-Q integrated", "tests/post-phase-n-q/integrated.test.mjs"],
];
const results = commands.map(([name, file]) => {
  const result = spawnSync(process.execPath, [file], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    name,
    command: `node ${file}`,
    exit_code: result.status,
    passed: result.status === 0,
    output: String(result.stdout).trim().slice(0, 4_000),
    error: String(result.stderr).trim().slice(0, 4_000),
  };
});
const report = {
  generated_at: new Date().toISOString(),
  contract_version: "post-phase-n-q-focused-tests/v1",
  test_command_count: results.length,
  passed_count: results.filter((item) => item.passed).length,
  failed_count: results.filter((item) => !item.passed).length,
  results,
  passed: results.every((item) => item.passed),
};
fs.writeFileSync(
  path.join(ROOT, "reports/post-phase-n-q/focused-tests.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(
  `Post-Phase N-Q focused tests: ${report.passed ? "PASS" : "HOLD"} (${report.passed_count}/${report.test_command_count})`,
);
if (!report.passed) process.exitCode = 1;
