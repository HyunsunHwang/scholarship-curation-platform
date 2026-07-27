import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildPhase2SameHtmlComparison } from "./phase2-same-html-comparison.mjs";
import { buildPhase3RemediationClusters } from "./phase3-remediation-clustering.mjs";
import { loadNoticeSourceManifestRegistry } from "../../notice-source-manifest-loader.mjs";
import { extractFromList } from "../crawler-list-parser.mjs";
import { applyListParserProfile } from "../list-parser-profiles.mjs";
import { validatePhase4ControlAuthority } from "./phase4-control-authority.mjs";

export const PHASE4B_OFFLINE_VERSION = "phase4b-offline-pilot-v1";
// Compatibility marker only. Authoritative control selection is loaded from the tracked snapshot.
export const PHASE4B_CONTROL_COMMIT = null;
export const PHASE4B_PILOT_SOURCE_IDS = Object.freeze(["cau_003", "cau_004", "cau_013", "hanyang_011", "korea_033", "korea_060", "skku_042", "uos_001", "hanyang_014"]);
export const RAW_CAPTURE_STATUSES = Object.freeze(["raw_capture_verified", "raw_capture_missing", "raw_capture_corrupt", "raw_capture_hash_mismatch", "raw_capture_report_mismatch", "raw_capture_unsupported_format"]);

function clean(value) { return String(value ?? "").trim(); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function canonical(value) { return JSON.stringify(stable(value)); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function failure(status, sourceId, reason, detail = null) { return { source_id: sourceId, raw_capture_status: status, blocking_reason: reason, detail }; }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")); }
function runGit(repositoryRoot, args) { return clean(execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
function sourceSummary(source) {
  return {
    source_id: source.sourceId, list_url: source.listUrl, base_url: source.baseUrl,
    list_item_selector: clean(source.listItemSelector) || null, link_selector: clean(source.linkSelector) || null,
    title_selector: clean(source.titleSelector) || null, date_selector: clean(source.dateSelector) || null,
    notice_url_pattern: clean(source.noticeUrlPattern) || null, list_parser_profile: clean(source.listParserProfile) || null,
    adapter: clean(source.adapter) || null, content_mode: clean(source.contentMode) || null,
  };
}

/** Read-only legacy importer. It never fetches, writes, migrates, or mutates pilot artifacts. */
export function loadLegacyPhase4PilotCapture({ sourceId, artifactPath, reportSource }) {
  if (!fs.existsSync(artifactPath)) return failure("raw_capture_missing", sourceId, "artifact_missing");
  let artifact;
  try { artifact = readJson(artifactPath); } catch { return failure("raw_capture_corrupt", sourceId, "artifact_json_unreadable"); }
  const capture = artifact?.capture;
  if (!capture || !["phase4-same-html-capture-v1", "phase4-capture-artifact-v1"].includes(clean(capture.schema_version))) {
    return failure("raw_capture_unsupported_format", sourceId, "capture_schema_unsupported");
  }
  if (clean(artifact.source_id) !== sourceId || clean(capture.source_id) !== sourceId || clean(reportSource?.source_id) !== sourceId) {
    return failure("raw_capture_report_mismatch", sourceId, "source_id_mismatch");
  }
  if (clean(artifact.capture_status) !== "capture_success" || clean(reportSource?.capture_status) !== "capture_success") {
    return failure("raw_capture_report_mismatch", sourceId, "capture_status_mismatch");
  }
  const base64 = clean(capture.html_base64);
  if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) return failure("raw_capture_corrupt", sourceId, "html_base64_invalid");
  const bytes = Buffer.from(base64, "base64");
  const calculatedHash = sha256(bytes);
  if (bytes.length !== capture.response_byte_count || calculatedHash !== clean(capture.html_sha256).toLowerCase()) return failure("raw_capture_hash_mismatch", sourceId, "artifact_byte_or_hash_mismatch");
  const reportCapture = reportSource.capture ?? {};
  const fields = ["requested_url", "final_url", "response_byte_count", "html_sha256"];
  if (fields.some((field) => String(capture[field] ?? "") !== String(reportCapture[field] ?? ""))) return failure("raw_capture_report_mismatch", sourceId, "report_capture_provenance_mismatch");
  return stable({
    source_id: sourceId, raw_capture_status: "raw_capture_verified", capture: {
      ...capture, html_base64: base64, html_sha256: calculatedHash, response_byte_count: bytes.length,
    },
    inventory: {
      source_id: sourceId, capture_status: "capture_success", requested_url: capture.requested_url,
      final_url: capture.final_url, http_status: capture.http_status, content_type: capture.content_type,
      charset: capture.charset, response_byte_count: bytes.length, html_sha256: calculatedHash,
      source_config_sha256: capture.source_config_sha256, code_sha: capture.code_sha,
      raw_bytes_present: true, report_match: true,
    },
  });
}

export async function withOfflineNetworkGuard(task) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { const error = new Error("Phase 4B offline runner forbids network access."); error.code = "phase4b_network_disabled"; throw error; };
  try { return await task(); } finally { globalThis.fetch = previousFetch; }
}

function controlProvenance({ repositoryRoot, source, controlCommit }) {
  return stable({
    control_reference_commit: controlCommit,
    control_reference_report: "reports/runtime-diagnostics/phase2-parser-remediation/runtime-input-snapshot.json",
    control_source_config_path: "config/notice-sources",
    control_parser_code_path: "lib/crawler-engine/crawler-list-parser.mjs",
    control_parser_code_blob_sha: runGit(repositoryRoot, ["rev-parse", `${controlCommit}:lib/crawler-engine/crawler-list-parser.mjs`]),
    control_parser_contract_version: "historical-manifest-generic-list-parser-v1",
    control_selection_reason: "tested_code_base_sha recorded by the tracked Phase 0 runtime input snapshot",
    source_config: sourceSummary(source),
    source_config_sha256: sha256(canonical(source)),
    reconstruction_tool_version: PHASE4B_OFFLINE_VERSION,
  });
}

function executionSummary(result) {
  return {
    parser_status: "success", candidate_count: result.candidates.length,
    parser_strategy: result.parser_evidence?.parser_strategy ?? null,
    dom_evidence: result.parser_evidence ?? null,
    url_identity_evidence: result.candidates.map((candidate) => candidate.noticeUrl ?? candidate.notice_url ?? null).filter(Boolean),
    error_code: null,
  };
}

function sanitizedComparison(evidence) {
  const comparison = evidence.candidate_comparison;
  const changed = comparison.removed_candidate_count > 0 || comparison.added_candidate_count > 0;
  return stable({
    source_id: evidence.source_id, capture_id: evidence.capture_id, capture: evidence.capture,
    control: { ...executionSummary(evidence.control), parser_config: evidence.control.parser_config },
    treatment: { ...executionSummary(evidence.treatment), parser_config: evidence.treatment.parser_config },
    candidate_comparison: comparison,
    comparison_status: changed ? "comparison_behavior_changed" : "comparison_no_change",
    execution_status: "comparison_ready",
    provenance_hash: sha256(canonical({ source_id: evidence.source_id, capture_id: evidence.capture_id, html_sha256: evidence.capture.html_sha256, comparison })),
  });
}

/** Offline-only Phase 4B builder. It reads local legacy artifacts and Git history; no HTTP path exists. */
export async function buildPhase4BOfflinePilot({
  repositoryRoot, rawCaptureDirectory, pilotReportPath, controlCommit = null, worktreePath = null, diagnosticOverride = false,
} = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  if (controlCommit && !diagnosticOverride) throw new Error("Non-snapshot Phase 4B control override is prohibited for authoritative reports.");
  const authority = await validatePhase4ControlAuthority({ repositoryRoot: root, worktreePath });
  if (controlCommit && controlCommit !== authority.control_commit_sha) throw new Error("Diagnostic control override differs from snapshot authority and cannot generate an authoritative report.");
  controlCommit = authority.control_commit_sha;
  const report = readJson(pilotReportPath);
  const reportById = new Map((report.sources ?? []).map((row) => [row.source_id, row]));
  if (report.pilot_source_count !== 9 || reportById.size !== 9) throw new Error("Phase 4B requires the tracked nine-source pilot report.");
  const currentRegistry = loadNoticeSourceManifestRegistry();
  const currentById = new Map(currentRegistry.sources.map((source) => [source.sourceId, source]));
  const rawRows = PHASE4B_PILOT_SOURCE_IDS.map((sourceId) => {
    const row = reportById.get(sourceId);
    if (sourceId === "hanyang_014") return { source_id: sourceId, raw_capture_status: "not_applicable_transport_failure", capture_status: row?.capture_status, next_phase_queue: "transport_recovery", blocking_reason: row?.blocking_reason ?? "capture_request_failed" };
    return loadLegacyPhase4PilotCapture({ sourceId, artifactPath: path.join(rawCaptureDirectory, `${sourceId}.json`), reportSource: row });
  });
  const verified = rawRows.filter((row) => row.raw_capture_status === "raw_capture_verified");
  const historical = authority.runtime;
  const historicalById = new Map(historical.sources.map((source) => [source.sourceId, source]));
  const comparisons = []; const reconciliations = [];
  await withOfflineNetworkGuard(async () => {
    for (const row of verified) {
      const historicalSource = historicalById.get(row.source_id);
      const treatmentSource = currentById.get(row.source_id);
      if (!historicalSource || !treatmentSource) {
        reconciliations.push({ source_id: row.source_id, control_status: "control_unavailable", next_phase_queue: "evidence_reconciliation", blocking_reason: "source_config_absent" });
        continue;
      }
      const provenance = controlProvenance({ repositoryRoot: root, source: historicalSource, controlCommit });
      try {
        const evidence = buildPhase2SameHtmlComparison({
          capture: row.capture, controlConfig: historicalSource, treatmentConfig: treatmentSource,
          controlParser: ({ source, html }) => historical.parser(source, html),
          treatmentParser: ({ source, html }) => extractFromList(source, html),
          controlApplyProfile: historical.applyProfile, treatmentApplyProfile: applyListParserProfile,
        });
        comparisons.push({ ...sanitizedComparison(evidence), control_provenance: { ...provenance, reconstruction_result_hash: sha256(canonical(evidence.control)) } });
      } catch (error) {
        reconciliations.push({ source_id: row.source_id, control_status: "control_reconstruction_error", next_phase_queue: "evidence_reconciliation", blocking_reason: clean(error?.message) || "control_reconstruction_error" });
      }
    }
  });
  const clusterInput = comparisons.map((row) => ({
    schema_version: "phase2-same-html-comparison-v1", source_id: row.source_id, capture_id: row.capture_id,
    capture: row.capture,
    control: { source_id: row.source_id, capture_id: row.capture_id, requested_url: row.capture.requested_url, final_url: row.capture.final_url, html_sha256: row.capture.html_sha256, candidates: [], parser_evidence: row.control.dom_evidence, parser_config: row.control.parser_config },
    treatment: { source_id: row.source_id, capture_id: row.capture_id, requested_url: row.capture.requested_url, final_url: row.capture.final_url, html_sha256: row.capture.html_sha256, candidates: [], parser_evidence: row.treatment.dom_evidence, parser_config: row.treatment.parser_config },
    candidate_comparison: row.candidate_comparison,
  }));
  // Rehydrate candidates only from comparison evidence, never raw HTML or URLs outside the capture contract.
  for (const evidence of clusterInput) {
    const original = comparisons.find((row) => row.source_id === evidence.source_id);
    const raw = verified.find((row) => row.source_id === evidence.source_id);
    if (!raw) continue;
    const same = buildPhase2SameHtmlComparison({ capture: raw.capture, controlConfig: historicalById.get(evidence.source_id), treatmentConfig: currentById.get(evidence.source_id), controlParser: ({ source, html }) => historical.parser(source, html), treatmentParser: ({ source, html }) => extractFromList(source, html), controlApplyProfile: historical.applyProfile, treatmentApplyProfile: applyListParserProfile });
    evidence.control = same.control; evidence.treatment = same.treatment;
    evidence.capture = same.capture; evidence.candidate_comparison = same.candidate_comparison;
    void original;
  }
  const clusters = buildPhase3RemediationClusters({ baseline: { target_count: clusterInput.length, targets: clusterInput.map((row) => ({ source_id: row.source_id })) }, sameCaptureEvidence: clusterInput });
  const inventory = rawRows.map((row) => row.inventory ?? stable({ source_id: row.source_id, raw_capture_status: row.raw_capture_status, capture_status: row.capture_status ?? null, next_phase_queue: row.next_phase_queue ?? "evidence_reconciliation", blocking_reason: row.blocking_reason ?? null }));
  const output = stable({
    schema_version: PHASE4B_OFFLINE_VERSION, offline_network_fetch_count: 0, control_reference_commit: controlCommit,
    inventory, reconciliations: reconciliations.sort((a, b) => a.source_id.localeCompare(b.source_id)),
    comparisons: comparisons.sort((a, b) => a.source_id.localeCompare(b.source_id)), clusters,
    accounting: { pilot_source_count: 9, raw_capture_verified_count: verified.length, comparison_ready_count: comparisons.length, reconciliation_count: reconciliations.length, transport_recovery_count: 1 },
  });
  if (output.accounting.comparison_ready_count + output.accounting.reconciliation_count + output.accounting.transport_recovery_count !== 9) {
    throw new Error(`Phase 4B pilot accounting invariant failed: ${canonical(output.accounting)}.`);
  }
  return output;
}

export function phase4BReportFiles(output) {
  const inventory = { schema_version: PHASE4B_OFFLINE_VERSION, offline_network_fetch_count: 0, sources: output.inventory };
  const reconciliation = { schema_version: PHASE4B_OFFLINE_VERSION, control_reference_commit: output.control_reference_commit, sources: [...output.comparisons.map((row) => ({ source_id: row.source_id, control_status: "control_restored", control_provenance: row.control_provenance })), ...output.reconciliations].sort((a, b) => a.source_id.localeCompare(b.source_id)) };
  const comparison = { schema_version: PHASE4B_OFFLINE_VERSION, offline_network_fetch_count: 0, comparisons: output.comparisons, exclusions: [...output.reconciliations, { source_id: "hanyang_014", exclusion_reason: "transport_failure", next_phase_queue: "transport_recovery" }].sort((a, b) => a.source_id.localeCompare(b.source_id)) };
  return { inventory, reconciliation, comparison, clusters: output.clusters };
}
