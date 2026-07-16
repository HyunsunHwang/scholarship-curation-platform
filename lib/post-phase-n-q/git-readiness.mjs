import { spawnSync } from "node:child_process";

function defaultRun(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function resultText(result, key) {
  return String(result[key] ?? "").trim();
}

function commandError(args, result) {
  return `git ${args.join(" ")} failed: ${resultText(result, "stderr") || resultText(result, "error") || "unknown error"}`;
}

function runRequired(run, args, cwd, errors) {
  const result = run(args, cwd);
  if (result.status !== 0) {
    errors.push(commandError(args, result));
    return null;
  }
  return resultText(result, "stdout");
}

export function collectGitReadiness({ cwd, run = defaultRun } = {}) {
  if (!cwd) throw new Error("cwd is required");
  const errors = [];
  const fetch = run(["fetch", "--prune", "origin"], cwd);
  if (fetch.status !== 0) {
    return {
      fetch_succeeded: false,
      fetched_origin_main_sha: null,
      evaluated_head_sha: null,
      merge_base_sha: null,
      origin_main_is_ancestor: null,
      ahead_by: null,
      behind_by: null,
      unresolved_conflict_count: null,
      worktree_clean: null,
      commands_succeeded: false,
      errors: ["REMOTE_FETCH_FAILED", commandError(["fetch", "--prune", "origin"], fetch)],
    };
  }

  const fetchedOriginMainSha = runRequired(run, ["rev-parse", "origin/main"], cwd, errors);
  const evaluatedHeadSha = runRequired(run, ["rev-parse", "HEAD"], cwd, errors);
  const mergeBaseSha = runRequired(run, ["merge-base", "origin/main", "HEAD"], cwd, errors);
  const ancestry = run(["merge-base", "--is-ancestor", "origin/main", "HEAD"], cwd);
  const originMainIsAncestor = ancestry.status === 0 ? true : ancestry.status === 1 ? false : null;
  if (originMainIsAncestor === null) errors.push(commandError(["merge-base", "--is-ancestor", "origin/main", "HEAD"], ancestry));
  const counts = runRequired(run, ["rev-list", "--left-right", "--count", "origin/main...HEAD"], cwd, errors);
  const [behindRaw, aheadRaw] = counts?.split(/\s+/u) ?? [];
  const behindBy = /^\d+$/u.test(behindRaw ?? "") ? Number(behindRaw) : null;
  const aheadBy = /^\d+$/u.test(aheadRaw ?? "") ? Number(aheadRaw) : null;
  if (counts && (behindBy === null || aheadBy === null)) errors.push("git rev-list returned an invalid ahead/behind count");
  const conflicts = runRequired(run, ["diff", "--name-only", "--diff-filter=U"], cwd, errors);
  const worktree = runRequired(run, ["status", "--porcelain"], cwd, errors);

  return {
    fetch_succeeded: true,
    fetched_origin_main_sha: fetchedOriginMainSha,
    evaluated_head_sha: evaluatedHeadSha,
    merge_base_sha: mergeBaseSha,
    origin_main_is_ancestor: originMainIsAncestor,
    ahead_by: aheadBy,
    behind_by: behindBy,
    unresolved_conflict_count: conflicts === null ? null : conflicts ? conflicts.split(/\r?\n/u).filter(Boolean).length : 0,
    worktree_clean: worktree === null ? null : worktree === "",
    commands_succeeded: errors.length === 0,
    errors,
  };
}

export function gitReadinessSnapshotMatches(report, readiness, { includeWorktree = true } = {}) {
  const keys = [
    "fetched_origin_main_sha",
    "evaluated_head_sha",
    "merge_base_sha",
    "origin_main_is_ancestor",
    "ahead_by",
    "behind_by",
    "unresolved_conflict_count",
  ];
  if (includeWorktree) keys.push("worktree_clean");
  return keys.every((key) => report?.git_readiness?.[key] === readiness[key]);
}

export function classifyMergeReadiness(readiness) {
  const basePass = readiness.fetch_succeeded && readiness.commands_succeeded && readiness.unresolved_conflict_count === 0 && readiness.worktree_clean === true;
  return {
    pr_creation_readiness: basePass ? "PASS" : "HOLD",
    branch_up_to_date_with_main: readiness.behind_by === 0 ? "PASS" : "OUTDATED",
    direct_fast_forward_merge_readiness:
      readiness.origin_main_is_ancestor === true && readiness.behind_by === 0
        ? "PASS"
        : "NOT_APPLICABLE",
  };
}
