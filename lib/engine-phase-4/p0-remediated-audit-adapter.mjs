const FIELD_MAP = Object.freeze({
  program_name: "scholarship_program_name",
  provider: "provider",
  institution_or_campus: "host_institution",
  application_start: "application_start",
  application_deadline: "application_deadline",
  lifecycle_status: "status",
  application_url: "application_url",
  support_type: "benefit_type",
  support_amount: "amount",
});

function adaptField(field) {
  return {
    value_status: field.status,
    normalized_value: field.value,
    evidence_refs: [...field.evidence_references],
    inference: { is_inferred: false },
  };
}

/**
 * Converts a P0 remediation result to the legacy canonical shape consumed by
 * evaluateP0Audit(). This is a shape-only adapter: it performs no extraction,
 * normalization, inference, or status coercion. In particular,
 * classification.is_recruitment carries publishable_opportunity verbatim. It
 * is not recomputed from document_kind because a recruitment notice can still
 * require publishability confirmation.
 */
export function adaptP0RemediatedOutputForAudit(output) {
  const fields = Object.fromEntries(Object.entries(FIELD_MAP).map(([sourceName, targetName]) => [
    targetName,
    adaptField(output.fields[sourceName]),
  ]));

  return {
    case_id: output.case_id,
    fields,
    classification: {
      document_kind: output.classification.document_kind,
      is_recruitment: output.classification.publishable_opportunity,
      evidence_refs: [...output.classification.evidence_references],
    },
    review: structuredClone(output.review),
  };
}

export const P0_REMEDIATED_AUDIT_FIELD_MAP = FIELD_MAP;
