export const ADMIN_DECISION_OPTIONS = Object.freeze([
  "accept",
  "edit",
  "reject",
  "insufficient_evidence",
  "defer_relation_resolution",
]);

export function buildSemanticReviewPacket({ input, deterministicRecord, proposalValidation }) {
  return {
    case_id: input.case_id,
    deterministic_result: {
      document_kind: deterministicRecord.classification.document_kind,
      publishable_opportunity: deterministicRecord.classification.is_recruitment,
      program_identity_status: deterministicRecord.program_identity_candidate.resolution_status,
      cycle_identity_status: deterministicRecord.recruitment_cycle_identity_candidate.resolution_status,
      review_reasons: deterministicRecord.review.reason_codes,
    },
    semantic_proposal: proposalValidation.proposal,
    evidence: input.evidence,
    deterministic_validation: {
      schema_valid: proposalValidation.schema_valid,
      semantic_valid: proposalValidation.semantic_valid,
      evidence_reference_valid: proposalValidation.evidence_reference_valid,
      errors: proposalValidation.errors,
    },
    proposal_delta: {
      organization_role_assertion_count: proposalValidation.proposal.organization_role_assertions.length,
      benefit_component_count: proposalValidation.proposal.benefit_components.length,
      program_candidate_count: proposalValidation.proposal.program_candidates.length,
      cycle_candidate_count: proposalValidation.proposal.cycle_candidates.length,
      relation_proposal_count: proposalValidation.proposal.relation_proposals.length,
      canonical_identity_changed: false,
    },
    representation_loss: {
      present: input.representation_loss_diagnostics.length > 0,
      diagnostics: input.representation_loss_diagnostics,
      canonical_projection: proposalValidation.proposal.canonical_projection,
    },
    admin_decision: {
      options: [...ADMIN_DECISION_OPTIONS],
      selected: null,
      persisted: false,
    },
  };
}
