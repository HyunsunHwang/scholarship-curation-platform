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

export function validatePhase4CRawInventory(rows, transportSourceId = "hanyang_014") {
  const ids = new Set();
  for (const row of rows ?? []) {
    if (!row?.source_id || ids.has(row.source_id)) { const error = new Error("Raw inventory source ID is missing or duplicate."); error.code = "phase4c_inventory_schema_invalid"; throw error; } ids.add(row.source_id);
    if (row.source_id === transportSourceId) { if (row.capture_status !== "transport_failure" || row.next_phase_queue !== "transport_recovery") { const error = new Error("Transport inventory row is invalid."); error.code = "phase4c_inventory_schema_invalid"; throw error; } continue; }
    if (row.raw_capture_status !== "raw_capture_verified" || row.capture_status !== "capture_success" || !/^[a-f0-9]{64}$/i.test(String(row.html_sha256 ?? "")) || !Number.isSafeInteger(row.response_byte_count) || row.response_byte_count < 0 || row.report_match !== true) { const error = new Error("Verified raw inventory row is invalid."); error.code = "phase4c_inventory_schema_invalid"; throw error; }
  }
  return true;
}

/** Creates one and only one terminal offline outcome per non-transport pilot source. */
export function buildPhase4CSourceOutcomes({ pilotSourceIds, inventory, comparisons, reconciliations, transportSourceId = "hanyang_014" } = {}) {
  validatePhase4CRawInventory(inventory, transportSourceId); const expected = new Set((pilotSourceIds ?? []).filter((id) => id !== transportSourceId)); const outcomes = new Map();
  const put = (row) => { if (!expected.has(row.source_id)) { const error = new Error("Unexpected Phase 4C source outcome."); error.code = "phase4c_source_outcome_unexpected"; throw error; } if (outcomes.has(row.source_id)) { const error = new Error("Conflicting Phase 4C source outcomes."); error.code = "phase4c_source_outcome_conflict"; throw error; } outcomes.set(row.source_id, row); };
  for (const row of inventory) if (row.source_id !== transportSourceId && row.raw_capture_status !== "raw_capture_verified") put(phase4CFailure({ sourceId: row.source_id, stage: "raw_capture", error: Object.assign(new Error(row.raw_capture_status), { code: row.raw_capture_status }) }));
  for (const row of comparisons ?? []) put({ source_id: row.source_id, execution_status: "comparison_ready", failed_stage: null, error_code: null, error_summary: null });
  for (const row of reconciliations ?? []) put({ source_id: row.source_id, execution_status: row.execution_status, failed_stage: row.failed_stage, error_code: row.error_code, error_summary: row.error_summary });
  if (outcomes.size !== expected.size) { const error = new Error("Phase 4C source outcome is missing."); error.code = "phase4c_source_outcome_missing"; throw error; }
  return [...outcomes.values()].sort((a, b) => a.source_id.localeCompare(b.source_id));
}

function privateIndexWriterProbe(privateRoot, authority) {
  const runIdentity = "phase4-preflight-index-probe";
  const validation = validatePhase4PrivateArtifactRoot({ repositoryRoot: authority.repositoryRoot, privateArtifactRoot: privateRoot, runIdentity, createRunDirectory: true });
  try {
    const artifactPath = path.join(validation.runDirectory, "captures", "probe.json");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true }); fs.writeFileSync(artifactPath, "{}\n", { flag: "wx" });
    const result = createPhase4PrivateArtifactIndex({ runDirectory: validation.runDirectory, indexMode: "preflight_probe", contractFingerprint: "0".repeat(64), codeSha: authority.control_commit_sha, authorityControlCommit: authority.control_commit_sha, sourceCount: 1, artifacts: [{ source_id: "probe", capture_status: "preflight_probe", artifact_relative_path: "captures/probe.json", artifact_sha256: sha256(fs.readFileSync(artifactPath)), html_sha256: null, response_byte_count: 0, requested_url_hash: null, final_url_hash: null, capture_id: null, source_config_sha256: "0".repeat(64), transport_policy_fingerprint: "unavailable" }] });
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
  let sources; try { sources = buildPhase4CSourceOutcomes({ pilotSourceIds: output.inventory.map((row) => row.source_id), inventory: output.inventory, comparisons: output.comparisons, reconciliations: output.reconciliations }); } catch (error) { return { schema_version: "phase4c-preflight-v1", ready_for_87_capture: false, blocking_reasons: [clean(error?.message)], authority, private_retention: privateRetention, network_fetch_count: 0 }; }
  const readyCount = output.accounting.pilot_source_count - output.accounting.transport_recovery_count;
  const controlParserSuccess = output.comparisons.filter((row) => row.control.parser_status === "success").length;
  const treatmentParserSuccess = output.comparisons.filter((row) => row.treatment.parser_status === "success").length;
  const comparisonNoChange = output.comparisons.filter((row) => row.comparison_status === "comparison_no_change").length;
  const comparisonBehaviorChanged = output.comparisons.filter((row) => row.comparison_status === "comparison_behavior_changed").length;
  const clusterSuccess = output.clusters?.summary?.clustered_source_count ?? 0;
  const unclassified = sources.filter((row) => !PHASE4C_EXECUTION_STATUSES.includes(row.execution_status)).length;
  const offlineFailures = sources.filter((row) => row.execution_status !== "comparison_ready").length;
  const ready = output.accounting.raw_capture_verified_count === readyCount && sources.length === readyCount && new Set(sources.map((row) => row.source_id)).size === readyCount && output.accounting.comparison_ready_count === readyCount && controlParserSuccess === readyCount && treatmentParserSuccess === readyCount && clusterSuccess === readyCount && offlineFailures === 0 && output.accounting.reconciliation_count === 0 && unclassified === 0 && output.offline_network_fetch_count === 0;
  return {
    schema_version: "phase4c-preflight-v1", ready_for_87_capture: ready, blocking_reasons: ready ? [] : ["phase4b_closeout_incomplete"],
    authority: Object.fromEntries(Object.entries(authority).filter(([key]) => !["worktree", "runtime", "repositoryRoot"].includes(key))),
    private_retention: { private_root_configured: privateRetention.configured, private_root_writable: privateRetention.writable, private_root_git_ignored: privateRetention.git_ignored, create_only_supported: privateRetention.create_only_supported, hardlink_publish_supported: privateRetention.hardlink_publish_supported, exclusive_publish_test: privateRetention.exclusive_publish_test, private_index_schema_version: PHASE4_PRIVATE_INDEX_SCHEMA_VERSION, private_index_writer: "pass", private_index_readback: "pass", raw_body_tracked: false, local_absolute_path_tracked: false },
    phase4b_closeout: { raw_verified: output.accounting.raw_capture_verified_count, control_authority_validated: output.comparisons.length, control_parser_success: controlParserSuccess, treatment_parser_success: treatmentParserSuccess, comparison_input_invariant_success: output.comparisons.length, comparison_output_invariant_success: output.comparisons.length, comparison_no_change: comparisonNoChange, comparison_behavior_changed: comparisonBehaviorChanged, cluster_input_count: output.comparisons.length, cluster_success: clusterSuccess, offline_outcome_count: sources.length, offline_failure_count: offlineFailures, transport_recovery: output.accounting.transport_recovery_count, transport_terminals: [{ source_id: "hanyang_014", capture_status: "transport_failure", next_phase_queue: "transport_recovery" }], taxonomy_unclassified_error_count: unclassified, network_fetch_count: output.offline_network_fetch_count, sources },
    network_fetch_count: 0,
  };
}

export function renderPhase4CCloseoutMarkdown(preflight) {
  const closeout = preflight.phase4b_closeout ?? {};
  return `# Phase 4B closeout preflight\n\n- Raw verified: ${closeout.raw_verified ?? 0}/8\n- Control authority/parser/treatment/comparison/cluster: ${closeout.control_authority_validated ?? 0}/8\n- Comparison no-change: ${closeout.comparison_no_change ?? 0}/8\n- Transport recovery: ${closeout.transport_recovery ?? 0}\n- Network fetches: ${preflight.network_fetch_count}\n- Ready for 87 capture: ${preflight.ready_for_87_capture}\n\nThis derived report is sanitized; no raw body, base64 payload, private path, or credentials are tracked.\n`;
}
