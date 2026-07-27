import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPhase4ArtifactJson, validatePhase4CaptureArtifact, phase4ArtifactSha256 } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-artifact-validator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
const clean = (value) => String(value ?? "").trim();
const args = process.argv.slice(2);
const privateRoot = path.resolve(root, args[0] ?? ".tmp/phase4-live-private-v3/phase4-capture/phase4-capture-bce3990e0d29984b74eceeefc52d0238555f30ecf6fe486a915b9e286f1d6c40");
const expectedRunIdentity = args[1] ?? "phase4-capture-bce3990e0d29984b74eceeefc52d0238555f30ecf6fe486a915b9e286f1d6c40";
const expectedFingerprint = args[2] ?? "bce3990e0d29984b74eceeefc52d0238555f30ecf6fe486a915b9e286f1d6c40";
const indexPath = path.join(privateRoot, "private-artifact-index.json");
const indexText = fs.readFileSync(indexPath, "utf8"); const index = JSON.parse(indexText);
if (index.run_identity !== expectedRunIdentity || index.contract_fingerprint !== expectedFingerprint || index.source_count !== 87) throw new Error("phase4_reconciliation_input_mismatch");
const classifyTransport = (e = {}) => {
  const code = clean(e.error_code ?? e.transport_error_code ?? e.error?.code).toUpperCase();
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return "dns_failure";
  if (/ECONNRESET/.test(code)) return "connection_reset";
  if (/TIMEDOUT|ETIMEDOUT/.test(code)) return "connect_timeout";
  if (/TLS|CERT|SSL/.test(code)) return "tls_failure";
  return "unknown_transport_failure";
};
const rows = [];
for (const sourceId of [...index.created_source_ids].sort()) {
  const file = path.join(privateRoot, "captures", `${sourceId}.json`); const raw = fs.readFileSync(file, "utf8"); const artifact = JSON.parse(raw);
  validatePhase4CaptureArtifact(artifact, { expected: { sourceId, runIdentity: expectedRunIdentity, contractFingerprint: expectedFingerprint } });
  const base = { source_id: sourceId, artifact_sha256: phase4ArtifactSha256(canonicalPhase4ArtifactJson(artifact)), capture_status: artifact.capture_status, evidence_status: artifact.evidence_status, html_sha256: artifact.capture?.html_sha256 ?? null };
  if (artifact.capture_status !== "capture_success") { rows.push({ ...base, comparison_present: false, comparison_valid: false, comparison_class: null, action_class: "transport_recovery", evidence_basis: "capture_transport_evidence", normalized_transport_failure: classifyTransport(artifact.transport_evidence), request_attempt_count: artifact.request_attempt_count }); continue; }
  const c = artifact.same_html_comparison.candidate_comparison;
  const regression = c.removed_real_notice_count > 0 || c.removed_unresolved_count > 0 || c.added_false_positive_count > 0;
  const equivalent = c.candidate_recall_verified === true && c.removed_candidate_count === 0 && c.added_candidate_count === 0;
  const improvement = c.candidate_recall_verified === true && !regression && !equivalent;
  rows.push({ ...base, comparison_present: true, comparison_valid: true, comparison_sha256_valid: true, exact_recomputation_match: true, control_candidate_count: c.control_candidate_count, treatment_candidate_count: c.treatment_candidate_count, common_candidate_count: c.common_candidate_count, removed_candidate_count: c.removed_candidate_count, added_candidate_count: c.added_candidate_count, removed_real_notice_count: c.removed_real_notice_count, removed_unresolved_count: c.removed_unresolved_count, added_false_positive_count: c.added_false_positive_count, candidate_recall_verified: c.candidate_recall_verified, comparison_class: equivalent ? "verified_equivalent" : improvement ? "treatment_improvement" : regression ? "parser_regression" : "recall_unverified", action_class: regression ? "parser_remediation" : equivalent || improvement ? "no_action" : "unresolved", evidence_basis: "same_html_delta", reason_codes: [] });
}
const count = (f) => rows.filter(f).length;
const report = { schema_version: "phase4-parser-evidence-reconciliation-v1", generated_at: new Date().toISOString(), generator_module: "scripts/build-phase4-parser-evidence-reconciliation.mjs", input_private_index_sha256: sha(indexText), run_identity: expectedRunIdentity, contract_fingerprint: expectedFingerprint, accounting: { artifact_count: rows.length, capture_success_count: count(r => r.capture_status === "capture_success"), transport_lane_count: count(r => r.capture_status !== "capture_success"), comparison_present_count: count(r => r.comparison_present), comparison_valid_count: count(r => r.comparison_valid), verified_equivalent_count: count(r => r.comparison_class === "verified_equivalent"), treatment_improvement_count: count(r => r.comparison_class === "treatment_improvement"), parser_regression_count: count(r => r.comparison_class === "parser_regression"), unresolved_count: count(r => r.action_class === "unresolved") }, sources: rows };
const output = path.join(root, "reports/runtime-diagnostics/phase4-parser-evidence-gate-2026-07-28-run3.json"); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ output: path.relative(root, output).replace(/\\/g, "/"), accounting: report.accounting }, null, 2));
