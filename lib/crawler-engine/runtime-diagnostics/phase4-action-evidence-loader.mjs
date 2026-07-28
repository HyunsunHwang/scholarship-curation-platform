import { classifyOperationalAction } from "./operational-crawl-failure-analyzer.mjs";
import { rebuildOperationalActionSummary } from "./operational-crawl-failure-analyzer.mjs";
import { validatePhase4ReconciliationReport } from "./phase4-evidence-reconciliation.mjs";

const EXPECTED_ACTION_CLASSES = new Set(["no_action", "parser_remediation", "transport_recovery"]);

function fail(message) { const error = new Error(message); error.code = "phase4_action_evidence_invalid"; throw error; }

/** Loads only reconciled, authoritative rows; never interprets raw captures. */
export function loadPhase4ActionEvidence(report, { expectedSourceIds = null, expectedRunIdentity, expectedContractFingerprint, expectedInputFileSha256, expectedAccounting = null } = {}) {
  try { validatePhase4ReconciliationReport(report, { expectedSourceIds, expectedRunIdentity, expectedContractFingerprint, expectedInputFileSha256, expectedAccounting }); }
  catch (error) { fail(error.code ?? error.message); }
  const rows = Array.isArray(report.sources) ? report.sources : fail("Reconciliation sources are required.");
  const byId = new Map();
  for (const row of rows) {
    const sourceId = String(row?.source_id ?? "").trim();
    if (!sourceId || byId.has(sourceId)) fail("Phase 4 action evidence Source IDs must be unique.");
    if (!EXPECTED_ACTION_CLASSES.has(row.action_class) || !["same_html_delta", "capture_transport_evidence"].includes(row.evidence_basis)) fail(`${sourceId}: invalid action or evidence basis.`);
    if (!/^[a-f0-9]{64}$/i.test(String(row.artifact_file_sha256 ?? ""))) fail(`${sourceId}: raw artifact SHA is required.`);
    const candidate = row.same_html_comparison?.candidate_comparison;
    const fields = ["control_candidate_count", "treatment_candidate_count", "common_candidate_count", "removed_candidate_count", "added_candidate_count", "removed_real_notice_count", "removed_unresolved_count", "added_false_positive_count"];
    const arithmetic = fields.every((key) => Number.isSafeInteger(candidate?.[key]) && candidate[key] >= 0)
      && candidate?.control_candidate_count === candidate?.common_candidate_count + candidate?.removed_candidate_count
      && candidate?.treatment_candidate_count === candidate?.common_candidate_count + candidate?.added_candidate_count
      && candidate?.removed_real_notice_count + candidate?.removed_unresolved_count <= candidate?.removed_candidate_count
      && candidate?.added_false_positive_count <= candidate?.added_candidate_count;
    if (row.capture_status === "capture_success") {
      if (row.comparison_validation_status !== "exact_valid" || !candidate || typeof candidate.candidate_recall_verified !== "boolean" || !arithmetic
        || !["no_action", "parser_remediation"].includes(row.action_class) || row.evidence_basis !== "same_html_delta") fail(`${sourceId}: invalid successful-capture action evidence.`);
      const expectedAction = candidate.removed_real_notice_count || candidate.removed_unresolved_count || candidate.added_false_positive_count ? "parser_remediation" : "no_action";
      if (row.action_class !== expectedAction) fail(`${sourceId}: action class contradicts candidate comparison.`);
    } else if (row.action_class !== "transport_recovery" || row.evidence_basis !== "capture_transport_evidence" || row.comparison_validation_status !== "not_present" || row.same_html_comparison !== null || !["dns_failure", "connection_reset", "connect_timeout", "tls_failure", "unknown_transport_failure"].includes(row.normalized_transport_failure)) fail(`${sourceId}: invalid transport action evidence.`);
    byId.set(sourceId, Object.freeze({
      capture_status: row.capture_status,
      comparison_validation_status: row.comparison_validation_status,
      action_class: row.action_class,
      evidence_basis: row.evidence_basis,
      artifact_file_sha256: row.artifact_file_sha256,
      normalized_transport_failure: row.normalized_transport_failure,
      same_html_comparison: row.same_html_comparison ?? null,
    }));
  }
  if (expectedSourceIds) {
    const expected = new Set(expectedSourceIds);
    if (expected.size !== expectedSourceIds.length || expected.size !== byId.size) fail("Phase 4 action evidence Source accounting mismatch.");
    for (const sourceId of expected) if (!byId.has(sourceId)) fail(`${sourceId}: action evidence is missing.`);
  }
  return byId;
}

export function injectPhase4ActionEvidence(diagnostics, evidenceBySourceId) {
  const rows = Array.isArray(diagnostics?.source_diagnostics) ? diagnostics.source_diagnostics : fail("Operational diagnostics are required.");
  return rebuildOperationalActionSummary({
    ...diagnostics,
    source_diagnostics: rows.map((row) => {
      const remediationEvidence = evidenceBySourceId.get(row.source_id) ?? null;
      if (!remediationEvidence) return row;
      const action = classifyOperationalAction({
        result: { result_status: row.runtime_result_status },
        status: row.capability_status,
        codes: row.operational_codes,
        remediationEvidence,
      });
      return { ...row, remediationEvidence, action_class: action.action_class, evidence_basis: action.evidence_basis, action_evidence: action.action_evidence };
    }),
  });
}
