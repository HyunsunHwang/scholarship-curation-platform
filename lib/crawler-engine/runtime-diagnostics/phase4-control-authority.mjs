import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PHASE4_AUTHORITY_SNAPSHOT_SCHEMA = "phase2-runtime-input-snapshot-v1";
export const PHASE4_AUTHORITY_SNAPSHOT_PATH = "reports/runtime-diagnostics/phase2-parser-remediation/runtime-input-snapshot.json";
const SHA = /^[a-f0-9]{40}$/i;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clean = (value) => String(value ?? "").trim();
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function git(root, args) { return clean(execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
function json(filePath) { try { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); } catch { fail("authority_snapshot_invalid", "Authority snapshot is unreadable JSON."); } }

/** Snapshot is the sole authoritative control selector for Phase 4. */
export function loadPhase4AuthoritySnapshot({ repositoryRoot, snapshotPath = PHASE4_AUTHORITY_SNAPSHOT_PATH } = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  const relativePath = path.isAbsolute(snapshotPath) ? path.relative(root, snapshotPath) : snapshotPath;
  const filePath = path.resolve(root, relativePath);
  const snapshot = json(filePath);
  const registry = snapshot.source_registry ?? {};
  const provenance = snapshot.provenance ?? {};
  const commit = clean(provenance.tested_code_base_sha);
  if (snapshot.schema_version !== PHASE4_AUTHORITY_SNAPSHOT_SCHEMA || !SHA.test(commit) || commit !== clean(registry.commitSha)) fail("authority_snapshot_invalid", "Authority snapshot schema or control commit is invalid.");
  for (const field of ["manifestSha256", "indexSha256"]) if (!/^[a-f0-9]{64}$/i.test(clean(registry[field]))) fail("authority_snapshot_invalid", `Authority snapshot ${field} is invalid.`);
  if (!Number.isSafeInteger(registry.sourceCount) || registry.sourceCount < 1) fail("authority_snapshot_invalid", "Authority snapshot source count is invalid.");
  if (!/^[a-f0-9]{64}$/i.test(clean(provenance.historical_target_report_sha256))) fail("authority_snapshot_invalid", "Authority snapshot target report hash is invalid.");
  return { root, filePath, relativePath: relativePath.split(path.sep).join("/"), snapshot, snapshotSha256: sha256(fs.readFileSync(filePath)), controlCommit: commit };
}

export function ensurePhase4HistoricalWorktree({ repositoryRoot, worktreePath, controlCommit }) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  if (!SHA.test(clean(controlCommit))) fail("control_authority_validation_failure", "Control commit is not a full Git SHA.");
  try { git(root, ["cat-file", "-e", `${controlCommit}^{commit}`]); } catch { fail("control_authority_validation_failure", "Snapshot control commit does not exist locally."); }
  const directory = path.resolve(worktreePath ?? path.join(root, ".tmp", `phase4-control-${controlCommit.slice(0, 12)}`));
  try {
    if (!fs.existsSync(directory)) { fs.mkdirSync(path.dirname(directory), { recursive: true }); execFileSync("git", ["-C", root, "worktree", "add", "--detach", directory, controlCommit], { stdio: "pipe" }); }
    if (git(directory, ["rev-parse", "HEAD"]) !== controlCommit) fail("control_worktree_failure", "Historical worktree HEAD differs from snapshot control commit.");
  } catch (error) { if (error.code) throw error; fail("control_worktree_failure", "Historical control worktree could not be prepared."); }
  return directory;
}

export async function validatePhase4ControlAuthority({ repositoryRoot, snapshotPath, worktreePath } = {}) {
  const authority = loadPhase4AuthoritySnapshot({ repositoryRoot, snapshotPath });
  const { root, snapshot, controlCommit } = authority;
  const target = path.resolve(root, snapshot.provenance.historical_target_report_path ?? "");
  if (!fs.existsSync(target) || sha256(fs.readFileSync(target)) !== clean(snapshot.provenance.historical_target_report_sha256).toLowerCase()) fail("control_authority_validation_failure", "Historical target report hash does not match snapshot.");
  const directory = ensurePhase4HistoricalWorktree({ repositoryRoot: root, worktreePath, controlCommit });
  const files = [
    ["parser", "lib/crawler-engine/crawler-list-parser.mjs", "extractFromList"],
    ["profile", "lib/crawler-engine/list-parser-profiles.mjs", "applyListParserProfile"],
    ["manifest_loader", "lib/notice-source-manifest-loader.mjs", "loadNoticeSourceManifestRegistry"],
  ];
  const modules = {};
  const blobs = {};
  for (const [key, file, expectedExport] of files) {
    try { blobs[key] = git(root, ["rev-parse", `${controlCommit}:${file}`]); modules[key] = await import(`${pathToFileURL(path.join(directory, file)).href}?phase4authority=${controlCommit}`); }
    catch { fail("control_module_load_failure", `Historical ${key} module could not be loaded.`); }
    if (typeof modules[key][expectedExport] !== "function") fail("control_module_load_failure", `Historical ${key} module lacks ${expectedExport}.`);
  }
  let registry;
  try { registry = modules.manifest_loader.loadNoticeSourceManifestRegistry(); } catch { fail("control_authority_validation_failure", "Historical manifest registry could not be loaded."); }
  const fingerprint = registry.fingerprint ?? {};
  const expected = snapshot.source_registry;
  if (registry.sources.length !== expected.sourceCount || fingerprint.manifestSha256 !== expected.manifestSha256 || fingerprint.indexSha256 !== expected.indexSha256) fail("control_authority_validation_failure", "Historical manifest fingerprint differs from authority snapshot.");
  return {
    authority_validation_status: "pass", control_commit_sha: controlCommit,
    control_parser_blob_sha: blobs.parser, control_profile_blob_sha: blobs.profile,
    control_manifest_loader_blob_sha: blobs.manifest_loader, control_manifest_sha256: fingerprint.manifestSha256,
    control_index_sha256: fingerprint.indexSha256, control_source_count: registry.sources.length,
    authority_snapshot_path: authority.relativePath, authority_snapshot_sha256: authority.snapshotSha256,
    historical_target_report_sha256: sha256(fs.readFileSync(target)), worktree: directory,
    runtime: { parser: modules.parser.extractFromList, applyProfile: modules.profile.applyListParserProfile, sources: registry.sources },
  };
}
