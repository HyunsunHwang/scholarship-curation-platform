export const CANDIDATE_HANDOFF_STATUSES = Object.freeze([
  "clean",
  "needs_review",
  "blocked",
  "excluded_non_opportunity",
  "deferred_relation_resolution",
]);

const TERMINAL_KINDS = new Set(["result_announcement", "general_guidance", "information_session"]);

function candidateEvidenceResolved(candidate, evidenceIds) {
  return candidate?.resolution_status === "proposed"
    && candidate.evidence_refs?.length > 0
    && candidate.evidence_refs.every((reference) => evidenceIds.has(reference));
}

export function evaluateCandidateHandoffGate({
  record,
  sourceResolution,
  terminalNonOpportunity,
  relationResolutionRequired,
  opportunityKind,
  canonicalSchemaValid,
  evidenceIntegrityValid,
  unsupportedPresentCount,
  representationLossRiskCount,
}) {
  const reasons = new Set();
  const evidenceIds = new Set(record.evidence?.map((item) => item.evidence_id) ?? []);
  const documentKind = record.classification.document_kind;
  const publishable = record.classification.is_recruitment === true;
  const terminal = terminalNonOpportunity === true || TERMINAL_KINDS.has(documentKind);
  const relationRequired = relationResolutionRequired === true || documentKind === "correction_notice";
  const finish = (handoffStatus, extraReasons = []) => {
    for (const reason of extraReasons) reasons.add(reason);
    const candidateOutputCreated = ["clean", "needs_review"].includes(handoffStatus);
    return {
      handoff_status: handoffStatus,
      candidate_output_created: candidateOutputCreated,
      clean_apply_allowed: handoffStatus === "clean",
      automatic_publish_allowed: false,
      notification_allowed: false,
      reason_codes: [...reasons].sort(),
    };
  };

  if (terminal) return finish("excluded_non_opportunity", ["terminal_non_opportunity"]);
  if (relationRequired) return finish("deferred_relation_resolution", ["relation_resolution_required"]);
  if (documentKind === "unknown") return finish("blocked", ["unknown_document"]);
  if (sourceResolution?.resolution_status !== "resolved" || !sourceResolution?.source_id) {
    return finish("blocked", [`source_resolution_${sourceResolution?.resolution_status ?? "missing"}`]);
  }
  if (!canonicalSchemaValid) reasons.add("canonical_schema_invalid");
  if (!evidenceIntegrityValid) reasons.add("evidence_integrity_failure");
  if (unsupportedPresentCount > 0) reasons.add("unsupported_present_claim");
  if (record.review.automatic_publish_allowed !== false) reasons.add("automatic_publication_enabled");
  if (record.review.notification_allowed !== false) reasons.add("notification_enabled");
  if (!record.program_identity_candidate || !record.recruitment_cycle_identity_candidate) reasons.add("canonical_identity_missing");
  if (reasons.size > 0) return finish("blocked");

  if (documentKind !== "recruitment_notice" || !["scholarship", "paid_student_activity"].includes(opportunityKind)) {
    return finish("blocked", ["not_standalone_opportunity_scope"]);
  }
  const programCandidate = record.program_identity_candidate;
  const cycleCandidate = record.recruitment_cycle_identity_candidate;
  const programUsable = candidateEvidenceResolved(programCandidate, evidenceIds)
    && typeof programCandidate.provider_normalized === "string"
    && typeof programCandidate.name_normalized === "string";
  const cycleUsable = candidateEvidenceResolved(cycleCandidate, evidenceIds)
    && typeof cycleCandidate.cycle_label === "string"
    && cycleCandidate.program_candidate_id === programCandidate.candidate_id;

  if (!publishable) reasons.add("publishability_requires_confirmation");
  if (!programUsable) reasons.add("program_identity_unresolved");
  if (!cycleUsable) reasons.add("cycle_identity_unresolved");
  if (record.review.required || record.review.reason_codes.length > 0) reasons.add("review_blocker_present");
  if (representationLossRiskCount > 0) reasons.add("representation_loss_risk");
  if (record.review.reason_codes.includes("upstream_evidence_incomplete")) reasons.add("upstream_evidence_incomplete");

  return reasons.size > 0 ? finish("needs_review") : finish("clean");
}
