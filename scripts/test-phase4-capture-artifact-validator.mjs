import assert from "node:assert/strict";
import {
  PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION,
  PHASE4_CAPTURE_CONTRACT_VERSION,
  PHASE4_CAPTURE_SCHEMA_VERSION,
  canonicalPhase4ArtifactJson,
  phase4ArtifactSha256,
  validatePhase4CaptureArtifact,
} from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-artifact-validator.mjs";

const sourceId = "source_001";
const bytes = Buffer.from("<html><body>notice</body></html>");
const sourceHash = "a".repeat(64);
const contract = { code_sha: "test-code", sources: [{ source_id: sourceId, source_config_sha256: sourceHash, treatment_config_sha256: sourceHash, historical_control_config_sha256: "historical_control_unavailable" }] };
const fingerprint = phase4ArtifactSha256(canonicalPhase4ArtifactJson(contract));
const capture = { schema_version: PHASE4_CAPTURE_SCHEMA_VERSION, capture_id: "source_001-capture", source_id: sourceId, requested_url: "https://example.test/list", final_url: "https://example.test/list", http_status: 200, content_type: "text/html; charset=utf-8", charset: "utf-8", response_byte_count: bytes.length, redirect_chain: [], html_base64: bytes.toString("base64"), html_sha256: phase4ArtifactSha256(bytes), source_config_sha256: sourceHash, code_sha: "test-code", transport_evidence: {} };
const valid = { schema_version: PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION, run_identity: `phase4-capture-${fingerprint}`, capture_contract_version: PHASE4_CAPTURE_CONTRACT_VERSION, contract_fingerprint: fingerprint, source_id: sourceId, capture_status: "capture_success", evidence_status: "insufficient_evidence", next_phase_queue: "historical_control_reconciliation", blocking_reason: "historical_control_config_unavailable", list_fetch_count: 1, request_attempt_count: 1, capture, treatment: {}, same_html_comparison: null, contract };
const check = (value) => validatePhase4CaptureArtifact(value, { expected: { sourceId, runIdentity: valid.run_identity, contractFingerprint: fingerprint } });
check(valid);
const metadata = { source_id: sourceId, capture_id: capture.capture_id, capture_status: valid.capture_status, evidence_status: valid.evidence_status, next_phase_queue: valid.next_phase_queue, blocking_reason: valid.blocking_reason, artifact_status: "committed", artifact_path: "/tmp/source_001.json", artifact_sha256: "b".repeat(64), artifact_schema_version: valid.schema_version, capture_contract_version: valid.capture_contract_version, run_identity: valid.run_identity, contract_fingerprint: fingerprint };
validatePhase4CaptureArtifact(valid, { expected: { sourceId, runIdentity: valid.run_identity, contractFingerprint: fingerprint }, metadata });
assert.throws(() => validatePhase4CaptureArtifact(valid, { expected: { sourceId, runIdentity: valid.run_identity, contractFingerprint: fingerprint }, metadata: { ...metadata, capture_status: "transport_failure" } }), /metadata/i);
for (const [label, mutation] of [
  ["unknown status", { capture_status: "unknown" }],
  ["resume status", { capture_status: "resume_skipped" }],
  ["artifact failure status", { capture_status: "artifact_commit_failure" }],
  ["missing capture", { capture: null }],
  ["missing capture id", { capture: { ...capture, capture_id: "" } }],
  ["source mismatch", { capture: { ...capture, source_id: "other" } }],
  ["bad html hash", { capture: { ...capture, html_sha256: "0".repeat(64) } }],
  ["non http final", { capture: { ...capture, final_url: "javascript:bad" } }],
  ["wrong queue", { next_phase_queue: "fixture_first_parser_remediation" }],
  ["unexpected comparison", { same_html_comparison: {} }],
  ["contract tamper", { contract: { ...contract, code_sha: "tampered" } }],
]) assert.throws(() => check({ ...valid, ...mutation }), /artifact|capture|contract|checkpoint/i, label);
const transport = { ...valid, capture_status: "transport_failure", capture: null, treatment: null, same_html_comparison: null, next_phase_queue: "transport_recovery", blocking_reason: "ECONNRESET", transport_evidence: {} };
check(transport);
assert.throws(() => check({ ...transport, capture }), /transport-failure/i);
const invalid = { ...valid, capture_status: "invalid_content", evidence_status: "insufficient_evidence", next_phase_queue: "capture_content_validation", blocking_reason: "non_html_content_type", treatment: null, capture: { ...capture, content_type: "application/json" } };
check(invalid);
assert.throws(() => check({ ...invalid, treatment: {} }), /invalid-content/i);
console.log("phase4_capture_artifact_validator_tests_passed=18");
