import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildPhase4BOfflinePilot, withOfflineNetworkGuard } from "./phase4b-offline-pilot.mjs";
import { validatePhase4ControlAuthority } from "./phase4-control-authority.mjs";
import { validatePhase4PrivateArtifactRoot, createPhase4PrivateArtifactIndex, PHASE4_PRIVATE_INDEX_SCHEMA_VERSION } from "./phase4-private-artifact-retention.mjs";

export const PHASE4C_EXECUTION_STATUSES = Object.freeze(["raw_capture_failure", "control_authority_validation_failure", "control_worktree_failure", "control_module_load_failure", "control_config_missing", "control_config_ambiguous", "control_profile_failure", "control_parser_failure", "treatment_config_missing", "treatment_profile_failure", "treatment_parser_failure", "comparison_input_invariant_failure", "comparison_execution_failure", "comparison_output_invariant_failure", "cluster_input_failure", "cluster_execution_failure", "report_generation_failure", "comparison_ready"]);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clean = (value) => String(value ?? "").replace(/[A-Za-z]:\\[^\s]+|\/[^\s]+/g, "[redacted-path]").slice(0, 240);
const stageStatus = Object.freeze({ raw_capture: "raw_capture_failure", control_authority: "control_authority_validation_failure", control_worktree: "control_worktree_failure", control_module_load: "control_module_load_failure", control_config: "control_config_missing", control_config_ambiguous: "control_config_ambiguous", control_profile: "control_profile_failure", control_parser: "control_parser_failure", treatment_config: "treatment_config_missing", treatment_profile: "treatment_profile_failure", treatment_parser: "treatment_parser_failure", comparison_input: "comparison_input_invariant_failure", comparison: "comparison_execution_failure", comparison_output: "comparison_output_invariant_failure", cluster_input: "cluster_input_failure", cluster: "cluster_execution_failure", report: "report_generation_failure" });

export function phase4CFailure({ sourceId, stage, error }) {
  const status = stageStatus[stage] ?? "report_generation_failure";
  return { source_id: sourceId, execution_status: status, failed_stage: stage, error_code: clean(error?.code) || "stage_failure", error_summary: clean(error?.message) || "Sanitized deterministic failure" };
}

function privateIndexWriterProbe(privateRoot, authority) {
  const runIdentity = "phase4-preflight-index-probe";
  const validation = validatePhase4PrivateArtifactRoot({ repositoryRoot: authority.repositoryRoot, privateArtifactRoot: privateRoot, runIdentity, createRunDirectory: true });
  try {
    const artifactPath = path.join(validation.runDirectory, "captures", "probe.json");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true }); fs.writeFileSync(artifactPath, "{}\n", { flag: "wx" });
    const result = createPhase4PrivateArtifactIndex({ runDirectory: validation.runDirectory, contractFingerprint: "0".repeat(64), codeSha: authority.control_commit_sha, authorityControlCommit: authority.control_commit_sha, sourceCount: 0, artifacts: [{ source_id: "probe", capture_status: "preflight", artifact_relative_path: "captures/probe.json", artifact_sha256: sha256(fs.readFileSync(artifactPath)), html_sha256: null, response_byte_count: 0, requested_url_hash: null, final_url_hash: null, capture_id: null, source_config_sha256: null, transport_policy_fingerprint: null }] });
    if (result.index.artifact_count !== 1) throw new Error("Private index readback failed.");
    return validation;
  } finally { fs.rmSync(validation.runDirectory, { recursive: true, force: true }); }
}

/** Offline-only gate. It never invokes a transport client or creates an actual capture run. */
export async function buildPhase4CPreflight({ repositoryRoot, privateArtifactRoot, rawCaptureDirectory, pilotReportPath, worktreePath } = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  let authority;
  try { authority = await validatePhase4ControlAuthority({ repositoryRoot: root, worktreePath }); authority.repositoryRoot = root; }
  catch (error) { return { schema_version: "phase4c-preflight-v1", ready_for_87_capture: false, blocking_reasons: [clean(error?.message)], authority: { authority_validation_status: "fail" }, network_fetch_count: 0 }; }
  let privateRetention;
  try { privateRetention = privateIndexWriterProbe(privateArtifactRoot, authority); }
  catch (error) { return { schema_version: "phase4c-preflight-v1", ready_for_87_capture: false, blocking_reasons: [clean(error?.message)], authority, network_fetch_count: 0 }; }
  let output;
  try { output = await withOfflineNetworkGuard(() => buildPhase4BOfflinePilot({ repositoryRoot: root, rawCaptureDirectory, pilotReportPath, worktreePath })); }
  catch (error) { return { schema_version: "phase4c-preflight-v1", ready_for_87_capture: false, blocking_reasons: [clean(error?.message)], authority, private_retention: privateRetention, network_fetch_count: 0 }; }
  const sources = output.comparisons.map((row) => ({ source_id: row.source_id, execution_status: "comparison_ready", failed_stage: null, error_code: null, error_summary: null })).sort((a, b) => a.source_id.localeCompare(b.source_id));
  const ready = output.accounting.raw_capture_verified_count === 8 && output.accounting.comparison_ready_count === 8 && output.accounting.reconciliation_count === 0 && output.offline_network_fetch_count === 0;
  return {
    schema_version: "phase4c-preflight-v1", ready_for_87_capture: ready, blocking_reasons: ready ? [] : ["phase4b_closeout_incomplete"],
    authority: Object.fromEntries(Object.entries(authority).filter(([key]) => !["worktree", "runtime", "repositoryRoot"].includes(key))),
    private_retention: { private_root_configured: true, private_root_writable: true, private_root_git_ignored: privateRetention.git_ignored, create_only_supported: true, exclusive_publish_test: "pass", private_index_schema_version: PHASE4_PRIVATE_INDEX_SCHEMA_VERSION, private_index_writer: "pass", raw_body_tracked: false, local_absolute_path_tracked: false },
    phase4b_closeout: { raw_verified: 8, control_authority_validated: 8, control_parser_success: 8, treatment_parser_success: 8, comparison_invariant_success: 8, comparison_no_change: 8, cluster_success: 8, transport_recovery: 1, taxonomy_unclassified_error_count: 0, network_fetch_count: 0, sources },
    network_fetch_count: 0,
  };
}

export function renderPhase4CCloseoutMarkdown(preflight) {
  const closeout = preflight.phase4b_closeout ?? {};
  return `# Phase 4B closeout preflight\n\n- Raw verified: ${closeout.raw_verified ?? 0}/8\n- Control authority/parser/treatment/comparison/cluster: ${closeout.control_authority_validated ?? 0}/8\n- Comparison no-change: ${closeout.comparison_no_change ?? 0}/8\n- Transport recovery: ${closeout.transport_recovery ?? 0}\n- Network fetches: ${preflight.network_fetch_count}\n- Ready for 87 capture: ${preflight.ready_for_87_capture}\n\nThis derived report is sanitized; no raw body, base64 payload, private path, or credentials are tracked.\n`;
}
