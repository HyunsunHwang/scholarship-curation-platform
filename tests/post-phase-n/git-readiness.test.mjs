import assert from "node:assert/strict";
import {
  classifyMergeReadiness,
  collectGitReadiness,
  gitReadinessSnapshotMatches,
} from "../../lib/post-phase-n-q/git-readiness.mjs";

function runner(responses) {
  const calls = [];
  return {
    calls,
    run(args) {
      calls.push(args.join(" "));
      const response = responses[args.join(" ")];
      return response ?? { status: 0, stdout: "", stderr: "" };
    },
  };
}

const success = runner({
  "fetch --prune origin": { status: 0, stdout: "", stderr: "" },
  "rev-parse origin/main": { status: 0, stdout: "main-sha\n" },
  "rev-parse HEAD": { status: 0, stdout: "head-sha\n" },
  "merge-base origin/main HEAD": { status: 0, stdout: "base-sha\n" },
  "merge-base --is-ancestor origin/main HEAD": { status: 0, stdout: "" },
  "rev-list --left-right --count origin/main...HEAD": { status: 0, stdout: "2\t5\n" },
  "diff --name-only --diff-filter=U": { status: 0, stdout: "" },
  "status --porcelain": { status: 0, stdout: "" },
});
const readiness = collectGitReadiness({ cwd: "/fixture", run: success.run });
assert.equal(readiness.fetch_succeeded, true);
assert.equal(readiness.behind_by, 2);
assert.equal(readiness.ahead_by, 5);
assert.equal(readiness.worktree_clean, true);
assert.deepEqual(classifyMergeReadiness(readiness), {
  pr_creation_readiness: "PASS",
  branch_up_to_date_with_main: "OUTDATED",
  direct_fast_forward_merge_readiness: "NOT_APPLICABLE",
});
assert.equal(gitReadinessSnapshotMatches({ git_readiness: readiness }, readiness), true);
for (const key of ["ahead_by", "behind_by", "merge_base_sha", "origin_main_is_ancestor"]) {
  assert.equal(gitReadinessSnapshotMatches({ git_readiness: { ...readiness, [key]: key === "origin_main_is_ancestor" ? false : "tampered" } }, readiness), false);
}

const failure = runner({ "fetch --prune origin": { status: 128, stderr: "network unavailable" } });
const failedReadiness = collectGitReadiness({ cwd: "/fixture", run: failure.run });
assert.equal(failedReadiness.fetch_succeeded, false);
assert.equal(failedReadiness.commands_succeeded, false);
assert.equal(failedReadiness.errors.includes("REMOTE_FETCH_FAILED"), true);
assert.deepEqual(failure.calls, ["fetch --prune origin"]);

console.log(JSON.stringify({ passed: true, fetch_failure_holds: true, report_tamper_rejected: true, behind_is_not_pr_blocker: true }, null, 2));
