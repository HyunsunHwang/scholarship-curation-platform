import { spawnSync } from "node:child_process";

export const FULL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

function executeGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  return {
    status: result.status,
    error: result.error ?? null,
  };
}

function commitRefExists(repoRoot, ref) {
  const result = executeGit(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (result.error || result.status !== 0) return { value: null, environmentError: true };
  return { value: true, environmentError: false };
}

function commitExists(repoRoot, sha) {
  const result = executeGit(repoRoot, ["cat-file", "-e", `${sha}^{commit}`]);
  if (result.error || result.status === null) return { value: null, environmentError: true };
  return { value: result.status === 0, environmentError: false };
}

function isAncestor(repoRoot, ancestor, descendant) {
  const result = executeGit(repoRoot, ["merge-base", "--is-ancestor", ancestor, descendant]);
  if (result.error || result.status === null || ![0, 1].includes(result.status)) {
    return { value: null, environmentError: true };
  }
  return { value: result.status === 0, environmentError: false };
}

export function validateGateCProvenance({
  repoRoot,
  corpusFreezeSha,
  relationCorrectionSha,
  targetRef = "HEAD",
  baseRef = "origin/main",
}) {
  const errors = [];
  let environmentError = false;
  const record = (code, result) => {
    if (result.environmentError) {
      environmentError = true;
      errors.push(`${code}_environment_error`);
      return null;
    }
    if (!result.value) errors.push(code);
    return result.value;
  };

  const corpusFormatValid = FULL_COMMIT_SHA_PATTERN.test(corpusFreezeSha ?? "");
  const relationFormatValid = FULL_COMMIT_SHA_PATTERN.test(relationCorrectionSha ?? "");
  if (!corpusFormatValid) errors.push("corpus_freeze_sha_invalid_format");
  if (!relationFormatValid) errors.push("relation_correction_sha_invalid_format");

  const targetExists = record("target_ref_missing", commitRefExists(repoRoot, targetRef));
  const baseExists = record("base_ref_missing", commitRefExists(repoRoot, baseRef));

  const corpusExists = corpusFormatValid
    ? record("corpus_freeze_commit_missing", commitExists(repoRoot, corpusFreezeSha))
    : false;
  const relationExists = relationFormatValid
    ? record("relation_correction_commit_missing", commitExists(repoRoot, relationCorrectionSha))
    : false;

  const corpusIsTargetAncestor = corpusExists && targetExists
    ? record("corpus_freeze_not_target_ancestor", isAncestor(repoRoot, corpusFreezeSha, targetRef))
    : false;
  const corpusIsAfterBase = corpusExists && baseExists
    ? record("corpus_freeze_before_gate_c_base", isAncestor(repoRoot, baseRef, corpusFreezeSha))
    : false;
  const relationIsTargetAncestor = relationExists && targetExists
    ? record("relation_correction_not_target_ancestor", isAncestor(repoRoot, relationCorrectionSha, targetRef))
    : false;
  const relationIsAfterBase = relationExists && baseExists
    ? record("relation_correction_before_gate_c_base", isAncestor(repoRoot, baseRef, relationCorrectionSha))
    : false;
  const relationOrderValid = corpusExists && relationExists
    ? record("relation_correction_precedes_corpus_freeze", isAncestor(repoRoot, corpusFreezeSha, relationCorrectionSha))
    : false;

  return {
    model: "separate_corpus_and_relation_provenance",
    target_ref: targetRef,
    base_ref: baseRef,
    corpus_freeze_sha_format_valid: corpusFormatValid,
    corpus_freeze_commit_exists: corpusExists,
    corpus_freeze_is_branch_ancestor: corpusIsTargetAncestor,
    corpus_freeze_is_after_or_equal_to_gate_c_base: corpusIsAfterBase,
    relation_provenance_required: true,
    relation_provenance_sha_format_valid: relationFormatValid,
    relation_provenance_commit_exists: relationExists,
    relation_provenance_is_branch_ancestor: relationIsTargetAncestor,
    relation_provenance_is_after_or_equal_to_gate_c_base: relationIsAfterBase,
    relation_provenance_order_valid: relationOrderValid,
    provenance_validation_status: environmentError ? "ENVIRONMENT_ERROR" : errors.length ? "FAIL" : "PASS",
    errors,
  };
}
