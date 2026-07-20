import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateGateCProvenance } from "../lib/engine-phase-4/gate-c-provenance.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase-4-gate-c-provenance-"));
const git = (...args) => execFileSync("git", args, { cwd: temporaryRoot, encoding: "utf8" }).trim();
const commit = (message, content) => {
  fs.writeFileSync(path.join(temporaryRoot, "history.txt"), `${content}\n`);
  git("add", "history.txt");
  git("commit", "-m", message);
  return git("rev-parse", "HEAD");
};

try {
  git("init");
  git("config", "user.name", "Gate C Provenance Test");
  git("config", "user.email", "gate-c-provenance@example.invalid");
  const baseSha = commit("base", "base");
  git("branch", "origin/main", baseSha);
  const freezeSha = commit("freeze corpus", "freeze");
  const relationSha = commit("correct relations", "relations");
  git("branch", "gate-c", relationSha);
  git("checkout", "-b", "side", baseSha);
  const sideSha = commit("side history", "side");
  git("checkout", "gate-c");

  const validate = (corpusFreezeSha, relationCorrectionSha, targetRef = "HEAD") => validateGateCProvenance({
    repoRoot: temporaryRoot,
    corpusFreezeSha,
    relationCorrectionSha,
    targetRef,
    baseRef: "origin/main",
  });

  assert.equal(validate(freezeSha, relationSha).provenance_validation_status, "PASS");

  git("branch", "-f", "origin/main", relationSha);
  assert.equal(validate(freezeSha, relationSha).provenance_validation_status, "PASS");
  git("branch", "-f", "origin/main", baseSha);

  const nonexistent = validate("f".repeat(40), relationSha);
  assert.equal(nonexistent.provenance_validation_status, "FAIL");
  assert.equal(nonexistent.corpus_freeze_commit_exists, false);

  const abbreviated = validate("f410929", relationSha);
  assert.equal(abbreviated.provenance_validation_status, "FAIL");
  assert.equal(abbreviated.corpus_freeze_sha_format_valid, false);

  const offBranch = validate(sideSha, relationSha);
  assert.equal(offBranch.provenance_validation_status, "FAIL");
  assert.equal(offBranch.corpus_freeze_is_branch_ancestor, false);

  const missingRelation = validate(freezeSha, undefined);
  assert.equal(missingRelation.provenance_validation_status, "FAIL");
  assert.equal(missingRelation.relation_provenance_sha_format_valid, false);

  const wrongOrder = validate(freezeSha, baseSha);
  assert.equal(wrongOrder.provenance_validation_status, "FAIL");
  assert.equal(wrongOrder.relation_provenance_order_valid, false);

  const missingTarget = validate(freezeSha, relationSha, "refs/heads/not-present");
  assert.equal(missingTarget.provenance_validation_status, "ENVIRONMENT_ERROR");
  assert.notEqual(missingTarget.provenance_validation_status, "PASS");

  const historicalBadSha = validateGateCProvenance({
    repoRoot: projectRoot,
    corpusFreezeSha: "f4109294e86df35f2b9508b20edc665a18c50334",
    relationCorrectionSha: "3f5d26cd0128083b240f9ae5d8a7fa513ee63a3c",
  });
  assert.equal(historicalBadSha.provenance_validation_status, "FAIL");
  assert.equal(historicalBadSha.corpus_freeze_commit_exists, false);

  const correctedRepositoryHistory = validateGateCProvenance({
    repoRoot: projectRoot,
    corpusFreezeSha: "f410929e93f7f003ad39a03a2376b4a24ef755dc",
    relationCorrectionSha: "3f5d26cd0128083b240f9ae5d8a7fa513ee63a3c",
  });
  assert.equal(correctedRepositoryHistory.provenance_validation_status, "PASS");

  console.log("ENGINE PHASE 4 GATE C PROVENANCE TEST: PASS");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
