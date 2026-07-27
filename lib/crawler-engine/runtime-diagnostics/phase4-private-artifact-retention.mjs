import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const PHASE4_PRIVATE_INDEX_SCHEMA_VERSION = "phase4-private-artifact-index-v1";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clean = (value) => String(value ?? "").trim();
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function run(root, args) { try { execFileSync("git", ["-C", root, ...args], { stdio: "ignore" }); return true; } catch { return false; } }

/** Validates an explicitly selected private root without exposing it in tracked output. */
export function validatePhase4PrivateArtifactRoot({ repositoryRoot, privateArtifactRoot, runIdentity, createRunDirectory = false } = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  if (!clean(privateArtifactRoot)) fail("private_artifact_root_missing", "A private artifact root is required.");
  if (!clean(runIdentity) || !/^[a-z0-9][a-z0-9_-]{2,120}$/i.test(runIdentity)) fail("private_artifact_run_identity_invalid", "Run identity is invalid.");
  const privateRoot = path.resolve(privateArtifactRoot);
  fs.mkdirSync(privateRoot, { recursive: true });
  if (fs.lstatSync(privateRoot).isSymbolicLink()) fail("private_artifact_root_symlink", "Private artifact root may not be a symlink.");
  const relative = path.relative(root, privateRoot);
  const internal = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (internal && (!run(root, ["check-ignore", "-q", "--", relative]) || run(root, ["ls-files", "--error-unmatch", "--", relative]))) fail("private_artifact_root_not_ignored", "Repository-local private artifact root must be ignored and untracked.");
  const probe = path.join(privateRoot, `.phase4-write-probe-${runIdentity}`);
  try { fs.writeFileSync(probe, "phase4", { flag: "wx" }); fs.unlinkSync(probe); } catch { fail("private_artifact_root_unwritable", "Private artifact root does not support create-only writes."); }
  const base = path.join(privateRoot, "phase4-capture"); const runDirectory = path.join(base, runIdentity);
  if (fs.existsSync(runDirectory)) fail("private_artifact_run_collision", "Phase 4 run identity already exists and cannot be overwritten.");
  if (createRunDirectory) { fs.mkdirSync(base, { recursive: true }); fs.mkdirSync(runDirectory, { recursive: false }); }
  return { configured: true, writable: true, git_ignored: internal ? true : null, create_only_supported: true, hardlink_publish_supported: true, run_directory_created: createRunDirectory, runDirectory };
}

export function createPhase4PrivateArtifactIndex({ runDirectory, contractFingerprint, codeSha, authorityControlCommit, sourceCount, artifacts }) {
  const directory = path.resolve(runDirectory); const indexPath = path.join(directory, "private-artifact-index.json");
  if (fs.existsSync(indexPath)) fail("private_artifact_index_exists", "Private artifact index already exists.");
  const rows = (artifacts ?? []).map((item) => {
    const relativePath = clean(item.artifact_relative_path); if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("..")) fail("private_artifact_index_invalid_path", "Artifact path must be private and relative.");
    const bytes = fs.readFileSync(path.join(directory, relativePath));
    if (clean(item.artifact_sha256).toLowerCase() !== sha256(bytes)) fail("private_artifact_hash_mismatch", "Artifact hash does not match bytes on disk.");
    return { ...item, artifact_relative_path: relativePath, artifact_sha256: sha256(bytes) };
  }).sort((a, b) => a.source_id.localeCompare(b.source_id));
  const index = { schema_version: PHASE4_PRIVATE_INDEX_SCHEMA_VERSION, run_identity: path.basename(directory), contract_fingerprint: contractFingerprint, capture_contract_version: "phase4-capture-contract-v2", code_sha: codeSha, authority_control_commit: authorityControlCommit, source_count: sourceCount, created_source_ids: rows.map((row) => row.source_id), terminal_source_ids: rows.map((row) => row.source_id), artifact_count: rows.length, artifacts: rows };
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, { flag: "wx" });
  return { index, index_sha256: sha256(fs.readFileSync(indexPath)) };
}
