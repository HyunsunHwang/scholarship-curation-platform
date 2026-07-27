import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPhase4AuthoritySnapshot, validatePhase4ControlAuthority } from "../lib/crawler-engine/runtime-diagnostics/phase4-control-authority.mjs";
import { validatePhase4PrivateArtifactRoot, createPhase4PrivateArtifactIndex } from "../lib/crawler-engine/runtime-diagnostics/phase4-private-artifact-retention.mjs";
import { PHASE4C_EXECUTION_STATUSES, phase4CFailure, buildPhase4CPreflight } from "../lib/crawler-engine/runtime-diagnostics/phase4c-preflight.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localRoot = path.join(root, ".tmp", "phase4c-test-private"); fs.rmSync(localRoot, { recursive: true, force: true });
try {
  const snapshot = loadPhase4AuthoritySnapshot({ repositoryRoot: root }); assert.equal(snapshot.snapshot.source_registry.sourceCount, 545); assert.equal(snapshot.controlCommit, snapshot.snapshot.source_registry.commitSha);
  const authority = await validatePhase4ControlAuthority({ repositoryRoot: root }); assert.equal(authority.authority_validation_status, "pass"); assert.match(authority.control_parser_blob_sha, /^[a-f0-9]{40}$/);
  assert.throws(() => loadPhase4AuthoritySnapshot({ repositoryRoot: root, snapshotPath: path.join(localRoot, "missing.json") }));
  assert.throws(() => validatePhase4PrivateArtifactRoot({ repositoryRoot: root, privateArtifactRoot: null, runIdentity: "abc" }), /required/i);
  const privateRoot = validatePhase4PrivateArtifactRoot({ repositoryRoot: root, privateArtifactRoot: localRoot, runIdentity: "run-one", createRunDirectory: true }); assert.equal(privateRoot.git_ignored, true);
  const artifact = path.join(privateRoot.runDirectory, "captures", "one.json"); fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, "{}\n", "utf8"); const hash = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
  const index = createPhase4PrivateArtifactIndex({ runDirectory: privateRoot.runDirectory, contractFingerprint: "0".repeat(64), codeSha: authority.control_commit_sha, authorityControlCommit: authority.control_commit_sha, sourceCount: 1, artifacts: [{ source_id: "one", capture_status: "capture_success", artifact_relative_path: "captures/one.json", artifact_sha256: hash, html_sha256: null, response_byte_count: 2, requested_url_hash: null, final_url_hash: null, capture_id: null, source_config_sha256: null, transport_policy_fingerprint: null }] }); assert.equal(index.index.artifact_count, 1); assert.throws(() => createPhase4PrivateArtifactIndex({ runDirectory: privateRoot.runDirectory, contractFingerprint: "0".repeat(64), codeSha: "x", authorityControlCommit: "x", sourceCount: 0, artifacts: [] }));
  const stages = { raw_capture: "raw_capture_failure", control_authority: "control_authority_validation_failure", control_worktree: "control_worktree_failure", control_module_load: "control_module_load_failure", control_config: "control_config_missing", control_config_ambiguous: "control_config_ambiguous", control_profile: "control_profile_failure", control_parser: "control_parser_failure", treatment_config: "treatment_config_missing", treatment_profile: "treatment_profile_failure", treatment_parser: "treatment_parser_failure", comparison_input: "comparison_input_invariant_failure", comparison: "comparison_execution_failure", comparison_output: "comparison_output_invariant_failure", cluster_input: "cluster_input_failure", cluster: "cluster_execution_failure", report: "report_generation_failure" };
  assert.equal(Object.keys(stages).length + 1, PHASE4C_EXECUTION_STATUSES.length);
  for (const [stage, status] of Object.entries(stages)) { const row = phase4CFailure({ sourceId: "x", stage, error: Object.assign(new Error("C:\\secret\\raw"), { code: "x" }) }); assert.equal(row.execution_status, status); assert.ok(row.failed_stage); }
  const result = await buildPhase4CPreflight({ repositoryRoot: root, privateArtifactRoot: localRoot, rawCaptureDirectory: path.join(root, ".tmp/runtime-analysis/phase4-capture-pilot-20260727-v3/captures"), pilotReportPath: path.join(root, "reports/runtime-diagnostics/phase4-capture-pilot-2026-07-27-run2.json") }); assert.equal(result.ready_for_87_capture, true); assert.equal(result.network_fetch_count, 0); assert.equal(result.phase4b_closeout.comparison_no_change, 8); assert.doesNotMatch(JSON.stringify(result), /html_base64|[A-Za-z]:\\/);
  console.log("phase4c_preflight_tests_passed=10");
} finally { fs.rmSync(localRoot, { recursive: true, force: true }); }
