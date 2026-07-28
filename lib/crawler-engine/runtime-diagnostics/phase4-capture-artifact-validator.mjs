import crypto from "node:crypto";
import { validatePhase2ComparisonInputs, validatePhase2ComparisonOutput } from "./phase2-same-html-comparison.mjs";
import { buildPhase2CandidateComparison } from "./phase2-candidate-comparison.mjs";

export const PHASE4_CAPTURE_SCHEMA_VERSION = "phase4-same-html-capture-v1";
export const PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION = "phase4-capture-artifact-v1";
export const PHASE4_CAPTURE_CONTRACT_VERSION = "phase4-capture-contract-v2";
export const PHASE4_TERMINAL_ARTIFACT_CAPTURE_STATUSES = Object.freeze([
  "capture_success", "blocked_external", "transport_failure", "invalid_content",
]);

const SHA256 = /^[a-f0-9]{64}$/i;
const HTTP = /^https?:\/\//i;
const HTML = /(?:text\/html|application\/xhtml\+xml)/i;

function clean(value) { return String(value ?? "").trim(); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
export function canonicalPhase4ArtifactJson(value) { return JSON.stringify(stable(value)); }
export function phase4ArtifactSha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function error(code, message) { const value = new Error(message); value.code = code; return value; }
function requiredText(value, field) { const text = clean(value); if (!text) throw error("phase4_artifact_missing_field", `Phase 4 artifact requires ${field}.`); return text; }
function requiredSha(value, field) { const text = requiredText(value, field); if (!SHA256.test(text)) throw error("phase4_artifact_invalid_sha256", `Phase 4 artifact ${field} must be SHA-256.`); return text.toLowerCase(); }
function nonNegative(value, field) { if (!Number.isSafeInteger(value) || value < 0) throw error("phase4_artifact_invalid_count", `Phase 4 artifact ${field} must be a non-negative safe integer.`); return value; }
function assertObject(value, field) { if (!value || typeof value !== "object" || Array.isArray(value)) throw error("phase4_artifact_invalid_structure", `Phase 4 artifact ${field} must be an object.`); return value; }

/** Validates that a ready artifact's comparison was produced from its exact capture. */
export function validatePhase4SameHtmlComparison({ artifact, comparison }) {
  const capture = assertObject(artifact?.capture, "capture");
  const value = assertObject(comparison, "same_html_comparison");
  if (value.schema_version !== "phase2-same-html-comparison-v1") throw error("phase4_same_html_schema_invalid", "Same-HTML comparison schema is invalid.");
  const provenance = [
    [value.source_id, artifact.source_id], [value.capture_id, capture.capture_id],
    [value.capture?.source_id, artifact.source_id], [value.capture?.capture_id, capture.capture_id],
    [value.capture?.requested_url, capture.requested_url], [value.capture?.final_url, capture.final_url],
    [value.capture?.html_sha256, capture.html_sha256], [value.capture?.response_byte_count, capture.response_byte_count],
    [value.capture?.captured_at, capture.captured_at], [value.capture?.content_type, capture.content_type],
    [value.capture?.charset, capture.charset],
    [value.control?.source_id, artifact.source_id], [value.treatment?.source_id, artifact.source_id],
    [value.control?.capture_id, capture.capture_id], [value.treatment?.capture_id, capture.capture_id],
    [value.control?.requested_url, capture.requested_url], [value.treatment?.requested_url, capture.requested_url],
    [value.control?.final_url, capture.final_url], [value.treatment?.final_url, capture.final_url],
    [value.control?.html_sha256, capture.html_sha256], [value.treatment?.html_sha256, capture.html_sha256],
    [value.candidate_comparison?.source_id, artifact.source_id], [value.candidate_comparison?.same_html_sha256, capture.html_sha256],
  ];
  if (provenance.some(([actual, expected]) => actual !== expected)) throw error("phase4_same_html_provenance_mismatch", "Same-HTML comparison provenance does not match artifact capture.");
  if (canonicalPhase4ArtifactJson(value.capture?.redirect_chain) !== canonicalPhase4ArtifactJson(capture.redirect_chain)) throw error("phase4_same_html_capture_metadata_mismatch", "Same-HTML comparison redirect chain does not match artifact capture.");
  try { validatePhase2ComparisonInputs({ capture: value.capture, control: value.control, treatment: value.treatment }); validatePhase2ComparisonOutput({ capture: value.capture, control: value.control, treatment: value.treatment, comparison: value.candidate_comparison }); } catch { throw error("phase4_same_html_accounting_invalid", "Same-HTML comparison candidate accounting is invalid."); }
  for (const candidate of [...value.control.candidates, ...value.treatment.candidates]) if (candidate?.source_capture_hash !== capture.html_sha256) throw error("phase4_same_html_candidate_provenance_mismatch", "Candidate capture provenance is invalid.");
  const c = value.candidate_comparison;
  for (const field of ["removed_real_notice_count", "removed_unresolved_count", "added_false_positive_count"]) nonNegative(c[field], `candidate_comparison.${field}`);
  if (c.candidate_recall_verified === true && (c.removed_real_notice_count || c.removed_unresolved_count || c.added_false_positive_count)) throw error("phase4_same_html_recall_contradiction", "Verified candidate recall contradicts candidate comparison.");
  let recomputed;
  try { recomputed = buildPhase2CandidateComparison({ sourceId: artifact.source_id, control: value.control, treatment: value.treatment }); } catch { throw error("phase4_same_html_candidate_provenance_mismatch", "Same-HTML candidates cannot be deterministically identified."); }
  if (canonicalPhase4ArtifactJson(c) !== canonicalPhase4ArtifactJson(recomputed)) throw error("phase4_same_html_candidate_comparison_mismatch", "Stored candidate comparison differs from exact recomputation.");
  return stable(value);
}

function validateCapture(capture, artifact, { allowInvalidContent = false } = {}) {
  const value = assertObject(capture, "capture");
  if (value.schema_version !== PHASE4_CAPTURE_SCHEMA_VERSION) throw error("phase4_artifact_capture_schema_mismatch", "Capture schema version is invalid.");
  if (requiredText(value.capture_id, "capture.capture_id") && requiredText(value.source_id, "capture.source_id") !== artifact.source_id) throw error("phase4_artifact_source_mismatch", "Capture source ID does not match artifact source ID.");
  for (const field of ["requested_url", "final_url"]) if (!HTTP.test(requiredText(value[field], `capture.${field}`))) throw error("phase4_artifact_invalid_url", `Capture ${field} must be HTTP(S).`);
  if (!Number.isSafeInteger(value.http_status) || value.http_status < 200 || value.http_status >= 300) throw error("phase4_artifact_invalid_http_status", "Capture must have a 2xx HTTP status.");
  if (!allowInvalidContent && !HTML.test(requiredText(value.content_type, "capture.content_type"))) throw error("phase4_artifact_invalid_content_type", "Successful capture must be HTML content.");
  const bytes = Buffer.from(value.html_base64 == null ? "" : String(value.html_base64), "base64");
  if (nonNegative(value.response_byte_count, "capture.response_byte_count") !== bytes.length || (!allowInvalidContent && bytes.length === 0)) throw error("phase4_artifact_byte_count_mismatch", "Capture byte count is invalid.");
  if (phase4ArtifactSha256(bytes) !== requiredSha(value.html_sha256, "capture.html_sha256")) throw error("phase4_artifact_html_hash_mismatch", "Capture HTML hash is invalid.");
  requiredSha(value.source_config_sha256, "capture.source_config_sha256");
  requiredText(value.code_sha, "capture.code_sha");
  assertObject(value.transport_evidence, "capture.transport_evidence");
  if (!Array.isArray(value.redirect_chain)) throw error("phase4_artifact_invalid_redirect_chain", "Capture redirect chain must be an array.");
  return value;
}

function validateStatusCombination(artifact) {
  const status = artifact.capture_status;
  const evidence = artifact.evidence_status;
  const queue = artifact.next_phase_queue;
  const blocking = artifact.blocking_reason;
  if (status === "capture_success" && evidence === "insufficient_evidence") {
    if (queue !== "historical_control_reconciliation" || blocking !== "historical_control_config_unavailable" || !artifact.treatment || artifact.same_html_comparison) throw error("phase4_artifact_invalid_status_combination", "Historical-control-unavailable capture contract is invalid.");
  } else if (status === "capture_success" && evidence === "ready_for_fixture") {
    if (queue !== "fixture_first_parser_remediation" || blocking != null || !artifact.same_html_comparison) throw error("phase4_artifact_invalid_status_combination", "Comparison-ready capture contract is invalid.");
  } else if (status === "blocked_external") {
    if (artifact.capture != null || evidence !== "insufficient_evidence" || !/^external_retry/.test(queue) || !clean(blocking) || artifact.treatment || artifact.same_html_comparison || !artifact.transport_evidence) throw error("phase4_artifact_invalid_status_combination", "Blocked-external capture contract is invalid.");
  } else if (status === "transport_failure") {
    if (artifact.capture != null || artifact.treatment || artifact.same_html_comparison || evidence !== "insufficient_evidence" || !/^transport_recovery/.test(queue) || !clean(blocking) || !artifact.transport_evidence) throw error("phase4_artifact_invalid_status_combination", "Transport-failure capture contract is invalid.");
  } else if (status === "invalid_content") {
    if (!artifact.capture || artifact.treatment || artifact.same_html_comparison || evidence !== "insufficient_evidence" || !/^capture_content_validation/.test(queue) || !clean(blocking)) throw error("phase4_artifact_invalid_status_combination", "Invalid-content capture contract is invalid.");
  } else throw error("phase4_artifact_unknown_status", "Artifact capture status is not terminal or supported.");

  if (status === "blocked_external" || status === "transport_failure") {
    const transportEvidence = assertObject(artifact.transport_evidence, "transport_evidence");
    if (nonNegative(transportEvidence.request_attempt_count, "transport_evidence.request_attempt_count") !== artifact.request_attempt_count) {
      throw error("phase4_artifact_transport_attempt_mismatch", "Transport evidence request attempt count does not match artifact request attempt count.");
    }
  }
}

export function validatePhase4ArtifactMetadata(metadata, expected = {}) {
  const value = assertObject(metadata, "artifact metadata");
  for (const field of ["source_id", "capture_status", "evidence_status", "next_phase_queue", "artifact_status", "artifact_path", "artifact_schema_version", "capture_contract_version", "run_identity", "contract_fingerprint"]) requiredText(value[field], `metadata.${field}`);
  if (value.artifact_status !== "committed") throw error("phase4_artifact_metadata_status", "Artifact metadata must be committed.");
  requiredSha(value.artifact_sha256, "metadata.artifact_sha256");
  if (expected.sourceId && value.source_id !== expected.sourceId) throw error("checkpoint_artifact_mismatch", "Artifact metadata source ID mismatch.");
  if (expected.runIdentity && value.run_identity !== expected.runIdentity) throw error("checkpoint_artifact_mismatch", "Artifact metadata run identity mismatch.");
  if (expected.contractFingerprint && value.contract_fingerprint !== expected.contractFingerprint) throw error("checkpoint_artifact_mismatch", "Artifact metadata contract fingerprint mismatch.");
  return stable(value);
}

/** Fail-closed canonical validator used before commit, after read, verify, recover, and resume. */
export function validatePhase4CaptureArtifact(artifact, { expected = {}, metadata = null } = {}) {
  const value = assertObject(artifact, "artifact");
  for (const field of ["schema_version", "run_identity", "capture_contract_version", "contract_fingerprint", "source_id", "capture_status", "evidence_status", "next_phase_queue", "list_fetch_count", "request_attempt_count", "contract"]) requiredText(value[field], field);
  if (value.schema_version !== PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION) throw error("phase4_artifact_schema_mismatch", "Artifact schema version is invalid.");
  if (value.capture_contract_version !== PHASE4_CAPTURE_CONTRACT_VERSION) throw error("phase4_artifact_contract_version_mismatch", "Artifact contract version is invalid.");
  if (expected.sourceId && value.source_id !== expected.sourceId) throw error("checkpoint_artifact_mismatch", "Artifact source ID mismatch.");
  if (!PHASE4_TERMINAL_ARTIFACT_CAPTURE_STATUSES.includes(value.capture_status)) throw error("phase4_artifact_unknown_status", "Artifact capture status is not terminal or supported.");
  nonNegative(value.list_fetch_count, "list_fetch_count"); nonNegative(value.request_attempt_count, "request_attempt_count");
  if (value.list_fetch_count !== 1 || value.request_attempt_count < value.list_fetch_count) throw error("phase4_artifact_invalid_count", "Terminal artifact fetch counts are invalid.");
  const contract = assertObject(value.contract, "contract");
  const contractFingerprint = requiredSha(value.contract_fingerprint, "contract_fingerprint");
  if (phase4ArtifactSha256(canonicalPhase4ArtifactJson(contract)) !== contractFingerprint) throw error("phase4_artifact_contract_fingerprint_mismatch", "Artifact contract fingerprint does not match contract content.");
  if (expected.runIdentity && value.run_identity !== expected.runIdentity) throw error("checkpoint_artifact_mismatch", "Artifact run identity mismatch.");
  if (expected.contractFingerprint && contractFingerprint !== expected.contractFingerprint) throw error("checkpoint_artifact_mismatch", "Artifact contract fingerprint mismatch.");
  const sourceRows = Array.isArray(contract.sources) ? contract.sources.filter((row) => row?.source_id === value.source_id) : [];
  if (sourceRows.length !== 1) throw error("phase4_artifact_contract_source_mismatch", "Artifact source is not uniquely present in its contract.");
  if (value.capture_status === "capture_success" || value.capture_status === "invalid_content") {
    const capture = validateCapture(value.capture, value, { allowInvalidContent: value.capture_status === "invalid_content" });
    if (capture.source_config_sha256 !== sourceRows[0].source_config_sha256 || capture.code_sha !== contract.code_sha) throw error("phase4_artifact_provenance_mismatch", "Capture provenance does not match contract.");
    if (value.transport_evidence != null && canonicalPhase4ArtifactJson(value.transport_evidence) !== canonicalPhase4ArtifactJson(capture.transport_evidence)) {
      throw error("phase4_artifact_transport_evidence_mismatch", "Root transport evidence does not match capture transport evidence.");
    }
    if (value.capture_status === "invalid_content" && !((value.blocking_reason === "empty_response_bytes" && capture.response_byte_count === 0) || (value.blocking_reason === "non_html_content_type" && !HTML.test(clean(capture.content_type))))) throw error("phase4_artifact_invalid_status_combination", "Invalid-content reason does not match capture evidence.");
  }
  validateStatusCombination(value);
  if (value.capture_status === "capture_success" && value.evidence_status === "ready_for_fixture") validatePhase4SameHtmlComparison({ artifact: value, comparison: value.same_html_comparison });
  if (metadata) {
    const meta = validatePhase4ArtifactMetadata(metadata, expected);
    const pairs = [["source_id", value.source_id], ["capture_status", value.capture_status], ["evidence_status", value.evidence_status], ["next_phase_queue", value.next_phase_queue], ["blocking_reason", value.blocking_reason], ["artifact_schema_version", value.schema_version], ["capture_contract_version", value.capture_contract_version], ["run_identity", value.run_identity], ["contract_fingerprint", value.contract_fingerprint]];
    for (const [field, expectedValue] of pairs) if ((meta[field] ?? null) !== (expectedValue ?? null)) throw error("checkpoint_artifact_mismatch", `Artifact metadata ${field} mismatch.`);
    if ((meta.capture_id ?? null) !== (value.capture?.capture_id ?? null)) throw error("checkpoint_artifact_mismatch", "Artifact metadata capture ID mismatch.");
  }
  return stable(value);
}
