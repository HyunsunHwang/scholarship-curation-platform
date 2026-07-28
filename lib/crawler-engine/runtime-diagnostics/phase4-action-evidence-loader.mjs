import { classifyOperationalAction } from "./operational-crawl-failure-analyzer.mjs";

const EXPECTED_ACTION_CLASSES = new Set(["no_action", "parser_remediation", "transport_recovery"]);

function fail(message) { const error = new Error(message); error.code = "phase4_action_evidence_invalid"; throw error; }

/** Loads only reconciled, authoritative rows; never interprets raw captures. */
export function loadPhase4ActionEvidence(report, { expectedSourceIds = null } = {}) {
  if (!report || report.schema_version !== "phase4-authoritative-evidence-reconciliation-v2") fail("Unsupported Phase 4 reconciliation report.");
  const rows = Array.isArray(report.sources) ? report.sources : fail("Reconciliation sources are required.");
  const byId = new Map();
  for (const row of rows) {
    const sourceId = String(row?.source_id ?? "").trim();
    if (!sourceId || byId.has(sourceId)) fail("Phase 4 action evidence Source IDs must be unique.");
    if (!EXPECTED_ACTION_CLASSES.has(row.action_class)) fail(`${sourceId}: unsupported action class.`);
    if (!/^[a-f0-9]{64}$/i.test(String(row.artifact_file_sha256 ?? ""))) fail(`${sourceId}: raw artifact SHA is required.`);
    if (row.capture_status === "capture_success" && row.comparison_validation_status !== "exact_valid") fail(`${sourceId}: successful capture must have exact comparison validation.`);
    if (row.capture_status !== "capture_success" && row.action_class !== "transport_recovery") fail(`${sourceId}: non-capture success must remain in transport recovery.`);
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
  return {
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
  };
}
