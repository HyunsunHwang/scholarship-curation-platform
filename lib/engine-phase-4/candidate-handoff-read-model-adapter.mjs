function bodyText(record) {
  const title = record.fields.title.normalized_value;
  return [...new Set(record.evidence
    .map((item) => item.normalized_text)
    .filter((value) => typeof value === "string" && value.trim() && value !== title))].join("\n");
}

export function buildCandidateHandoffReadModel({
  record,
  sourceResolution,
  handoffResult,
  p0Extensions,
  conversionDiagnostics,
  fullGateCIdentity,
  fixedTimestamp,
}) {
  if (!handoffResult.candidate_output_created) return null;
  if (sourceResolution.resolution_status !== "resolved" || !sourceResolution.source_id) {
    throw new Error("Candidate output requires an exactly resolved source");
  }
  const originalUrl = record.source_notice_identity.canonical_url;
  const evidenceProvenance = record.evidence.map((item) => ({
    evidence_id: item.evidence_id,
    source_type: item.source_type,
    source_notice_id: item.source_notice_id,
    document_id: item.document_id,
    document_revision_id: item.document_revision_id,
    document_hash: item.document_hash,
    locator: item.locator,
  }));
  return {
    source_id: sourceResolution.source_id,
    source_key_snapshot: record.source_notice_identity.source_key_snapshot,
    canonical_key: `${sourceResolution.source_id}|${record.source_notice_identity.identity_key}`,
    title: record.fields.title.normalized_value,
    original_url: originalUrl,
    normalized_url: originalUrl,
    body_text: bodyText(record),
    published_at: null,
    review_status: handoffResult.handoff_status,
    body_quality: record.review.reason_codes.includes("upstream_evidence_incomplete") ? "attachment_required_unknown" : "good_text",
    duplicate_status: "unique",
    program_identity_status: record.program_identity_candidate.resolution_status,
    cycle_identity_status: record.recruitment_cycle_identity_candidate.resolution_status,
    document_kind: record.classification.document_kind,
    publishable_opportunity: record.classification.is_recruitment,
    evidence_json: {
      source_resolution: sourceResolution,
      classification: record.classification,
      canonical_validation: { valid: true, evidence_integrity_valid: true },
      p0_extensions: p0Extensions,
      identity: {
        program: record.program_identity_candidate,
        cycle: record.recruitment_cycle_identity_candidate,
      },
      review_reason_codes: record.review.reason_codes,
      handoff_gate_result: handoffResult,
      representation_loss_diagnostics: conversionDiagnostics,
      evidence_provenance: evidenceProvenance,
      full_gate_c_report_identity: fullGateCIdentity,
    },
    created_at: fixedTimestamp,
    updated_at: fixedTimestamp,
  };
}
