import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const PHASE4_PRIVATE_INDEX_SCHEMA_VERSION = "phase4-private-artifact-index-v1";
const SHA256 = /^[a-f0-9]{64}$/i; const GIT_SHA = /^[a-f0-9]{40}$/i;
const TERMINAL = new Set(["capture_success", "blocked_external", "transport_failure", "invalid_content"]);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clean = (value) => String(value ?? "").trim();
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function run(root, args) { try { execFileSync("git", ["-C", root, ...args], { stdio: "ignore" }); return true; } catch { return false; } }
function text(value, field) { const result = clean(value); if (!result) fail("private_artifact_index_invalid", `${field} is required.`); return result; }
function hash(value, field) { const result = text(value, field); if (!SHA256.test(result)) fail("private_artifact_index_invalid", `${field} must be SHA-256.`); return result.toLowerCase(); }
function count(value, field) { if (!Number.isSafeInteger(value) || value < 0) fail("private_artifact_index_invalid", `${field} must be a non-negative safe integer.`); return value; }
function unique(values, field) { if (new Set(values).size !== values.length) fail("private_artifact_index_accounting", `${field} contains duplicates.`); }
function contains(set, values) { return values.every((value) => set.has(value)); }

export function probePhase4ExclusivePublish(privateRoot, runIdentity) {
  const directory = path.join(privateRoot, `.phase4-exclusive-probe-${runIdentity}`); fs.mkdirSync(directory, { recursive: false });
  const first = path.join(directory, "first.tmp"); const second = path.join(directory, "second.tmp"); const final = path.join(directory, "final.json");
  try {
    fs.writeFileSync(first, "first", { flag: "wx" }); fs.writeFileSync(second, "second", { flag: "wx" });
    const results = [first, second].map((item) => { try { fs.linkSync(item, final); return { ok: true, file: item }; } catch (error) { return { ok: false, code: error?.code }; } });
    const winners = results.filter((row) => row.ok); const losers = results.filter((row) => !row.ok);
    if (winners.length !== 1 || losers.length !== 1 || losers[0].code !== "EEXIST") fail("private_artifact_hardlink_unsupported", "Exclusive hard-link publish did not yield exactly one EEXIST loser.");
    const finalBytes = fs.readFileSync(final); if (!finalBytes.equals(fs.readFileSync(winners[0].file))) fail("private_artifact_hardlink_corrupt", "Exclusive hard-link publish changed final bytes.");
    try { fs.linkSync(second, final); fail("private_artifact_hardlink_not_exclusive", "Second publish unexpectedly succeeded."); } catch (error) { if (error.code !== "EEXIST") throw error; }
    return { hardlink_publish_supported: true, exclusive_publish_test: "pass", final_sha256: sha256(finalBytes) };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

/** Validates an explicitly selected private root without exposing it in tracked output. */
export function validatePhase4PrivateArtifactRoot({ repositoryRoot, privateArtifactRoot, runIdentity, mode = "preflight", createRunDirectory = false } = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  if (!clean(privateArtifactRoot)) fail("private_artifact_root_missing", "A private artifact root is required.");
  if (!clean(runIdentity) || !/^[a-z0-9][a-z0-9_-]{2,120}$/i.test(runIdentity)) fail("private_artifact_run_identity_invalid", "Run identity is invalid.");
  const privateRoot = path.resolve(privateArtifactRoot); fs.mkdirSync(privateRoot, { recursive: true });
  if (fs.lstatSync(privateRoot).isSymbolicLink()) fail("private_artifact_root_symlink", "Private artifact root may not be a symlink.");
  const relative = path.relative(root, privateRoot); const internal = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (internal && (!run(root, ["check-ignore", "-q", "--", relative]) || run(root, ["ls-files", "--error-unmatch", "--", relative]))) fail("private_artifact_root_not_ignored", "Repository-local private artifact root must be ignored and untracked.");
  const probe = path.join(privateRoot, `.phase4-write-probe-${runIdentity}`); try { fs.writeFileSync(probe, "phase4", { flag: "wx" }); fs.unlinkSync(probe); } catch { fail("private_artifact_root_unwritable", "Private artifact root does not support create-only writes."); }
  const publish = probePhase4ExclusivePublish(privateRoot, runIdentity);
  if (!["preflight", "fresh", "resume"].includes(mode)) fail("private_artifact_resume_contract_invalid", "Private artifact root mode is invalid.");
  const base = path.join(privateRoot, "phase4-capture"); const runDirectory = path.join(base, runIdentity); const exists = fs.existsSync(runDirectory);
  if (exists && fs.lstatSync(runDirectory).isSymbolicLink()) fail("private_artifact_run_symlink", "Phase 4 run directory may not be a symlink.");
  if (mode === "fresh" && exists) fail("private_artifact_run_collision", "Phase 4 fresh run identity already exists and cannot be overwritten.");
  if (mode === "resume" && !exists) fail("private_artifact_run_missing", "Phase 4 resume run directory is missing.");
  if (createRunDirectory) { if (mode === "resume") fail("private_artifact_resume_contract_invalid", "Resume cannot create a run directory."); fs.mkdirSync(base, { recursive: true }); fs.mkdirSync(runDirectory, { recursive: false }); }
  return { configured: true, writable: true, git_ignored: internal ? true : null, create_only_supported: true, ...publish, mode, run_directory_created: createRunDirectory, runDirectory };
}

function validateRow(row, directory, indexMode) {
  const sourceId = text(row.source_id, "artifact.source_id"); const status = text(row.capture_status, "artifact.capture_status");
  if (indexMode === "production_final" ? !TERMINAL.has(status) : status !== "preflight_probe") fail("private_artifact_index_invalid", "Artifact capture status is invalid for index mode.");
  const relativePath = text(row.artifact_relative_path, "artifact.artifact_relative_path"); if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) fail("private_artifact_index_invalid_path", "Artifact path must be relative and cannot traverse.");
  const filePath = path.resolve(directory, relativePath); if (!filePath.startsWith(`${directory}${path.sep}`)) fail("private_artifact_index_invalid_path", "Artifact path escapes run directory.");
  const bytes = fs.readFileSync(filePath); const artifactHash = hash(row.artifact_sha256, "artifact.artifact_sha256"); if (artifactHash !== sha256(bytes)) fail("private_artifact_hash_mismatch", "Artifact hash does not match bytes on disk.");
  const byteCount = count(row.response_byte_count, "artifact.response_byte_count");
  if (status === "capture_success" || status === "invalid_content") { hash(row.html_sha256, "artifact.html_sha256"); text(row.capture_id, "artifact.capture_id"); } else if (row.html_sha256 != null || row.capture_id != null) fail("private_artifact_index_invalid", "Non-content capture status cannot have HTML/capture ID.");
  hash(row.source_config_sha256, "artifact.source_config_sha256"); if (!(SHA256.test(clean(row.transport_policy_fingerprint)) || clean(row.transport_policy_fingerprint) === "unavailable")) fail("private_artifact_index_invalid", "Transport fingerprint is invalid.");
  return { ...row, source_id: sourceId, capture_status: status, artifact_relative_path: relativePath, artifact_sha256: artifactHash, response_byte_count: byteCount };
}

export function validatePhase4PrivateArtifactIndex({ index, runDirectory, expectFinal = false } = {}) {
  if (!index || typeof index !== "object" || index.schema_version !== PHASE4_PRIVATE_INDEX_SCHEMA_VERSION) fail("private_artifact_index_invalid", "Private artifact index schema is invalid.");
  const directory = path.resolve(runDirectory); const mode = text(index.index_mode, "index_mode"); if (!["preflight_probe", "production_final"].includes(mode)) fail("private_artifact_index_invalid", "Index mode is invalid.");
  text(index.run_identity, "run_identity"); hash(index.contract_fingerprint, "contract_fingerprint"); if (!GIT_SHA.test(text(index.code_sha, "code_sha")) || !GIT_SHA.test(text(index.authority_control_commit, "authority_control_commit"))) fail("private_artifact_index_invalid", "Index Git SHA is invalid.");
  const sourceCount = count(index.source_count, "source_count"); const artifactCount = count(index.artifact_count, "artifact_count"); if (!Array.isArray(index.artifacts) || artifactCount !== index.artifacts.length || artifactCount > sourceCount) fail("private_artifact_index_accounting", "Artifact accounting is invalid.");
  const rows = index.artifacts.map((row) => validateRow(row, directory, mode)).sort((a, b) => a.source_id.localeCompare(b.source_id)); const ids = rows.map((row) => row.source_id); unique(ids, "artifact source IDs");
  for (const field of ["created_source_ids", "terminal_source_ids"]) if (!Array.isArray(index[field])) fail("private_artifact_index_accounting", `${field} must be an array.`);
  unique(index.created_source_ids, "created_source_ids"); unique(index.terminal_source_ids, "terminal_source_ids"); if (index.created_source_ids.join("|") !== ids.join("|") || !contains(new Set(index.created_source_ids), index.terminal_source_ids)) fail("private_artifact_index_accounting", "Index source sets are inconsistent.");
  if ((expectFinal || mode === "production_final") && (index.terminal_source_ids.join("|") !== ids.join("|") || artifactCount !== sourceCount)) fail("private_artifact_index_accounting", "Final index must fully account for its source set.");
  if (mode === "preflight_probe" && (sourceCount !== 1 || artifactCount !== 1)) fail("private_artifact_index_accounting", "Preflight probe index must have one artifact.");
  return { ...index, artifacts: rows };
}

export function createPhase4PrivateArtifactIndex({ runDirectory, contractFingerprint, codeSha, authorityControlCommit, sourceCount, artifacts, indexMode = "production_final" }) {
  const directory = path.resolve(runDirectory); const indexPath = path.join(directory, "private-artifact-index.json"); if (fs.existsSync(indexPath)) fail("private_artifact_index_exists", "Private artifact index already exists.");
  const rows = (artifacts ?? []).slice().sort((a, b) => String(a.source_id).localeCompare(String(b.source_id)));
  const index = { schema_version: PHASE4_PRIVATE_INDEX_SCHEMA_VERSION, index_mode: indexMode, run_identity: path.basename(directory), contract_fingerprint: contractFingerprint, capture_contract_version: "phase4-capture-contract-v2", code_sha: codeSha, authority_control_commit: authorityControlCommit, source_count: sourceCount, created_source_ids: rows.map((row) => row.source_id), terminal_source_ids: rows.map((row) => row.source_id), artifact_count: rows.length, artifacts: rows };
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, { flag: "wx" }); const validated = validatePhase4PrivateArtifactIndex({ index: JSON.parse(fs.readFileSync(indexPath, "utf8")), runDirectory: directory });
  return { index: validated, index_sha256: sha256(fs.readFileSync(indexPath)) };
}
