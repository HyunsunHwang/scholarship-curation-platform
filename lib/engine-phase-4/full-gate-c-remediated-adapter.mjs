const P0_TO_CANONICAL_FIELDS = Object.freeze({
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

const CANONICAL_STATUSES = new Set(["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"]);

function mappedEvidenceId(evidenceId) {
  return `ev_p0_${String(evidenceId).replace(/^p0ev_/u, "")}`;
}

function mappedReferences(references) {
  return [...new Set(references.map(mappedEvidenceId))];
}

function canonicalDate(value) {
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return { kind: "exact_date", date: value, timezone: null, inferred: false };
  if (/^\d{4}-\d{2}-\d{2}T/u.test(value)) return { kind: "exact_datetime", datetime: value, timezone: value.match(/([+-]\d{2}:\d{2}|Z)$/u)?.[1] ?? null, inferred: false };
  return null;
}

function canonicalAmount(value) {
  if (!value || typeof value !== "object") return null;
  const period = ["one_time", "month", "semester", "year", "program", "not_applicable"].includes(value.period) ? value.period : "not_applicable";
  if (value.kind === "exact" && Number.isFinite(value.exact_amount)) return { kind: "exact", currency: value.currency, amount: value.exact_amount, period };
  if (value.kind === "range" && Number.isFinite(value.minimum_amount) && Number.isFinite(value.maximum_amount)) return { kind: "range", currency: value.currency, minimum: value.minimum_amount, maximum: value.maximum_amount, period };
  if (value.kind === "full_tuition") return { kind: "full_tuition", currency: null, period };
  if (value.kind === "tuition_percentage") return { kind: "partial_tuition", currency: null, period, description: value.display };
  if (value.kind === "non_cash" && value.display) return { kind: "non_cash", currency: null, period, description: value.display };
  return null;
}

function canonicalValue(fieldName, value) {
  if (["application_start", "application_deadline"].includes(fieldName)) return canonicalDate(value);
  if (fieldName === "support_amount") return canonicalAmount(value);
  if (fieldName === "institution_or_campus") return Array.isArray(value) ? value : [value];
  if (fieldName === "support_type") return Array.isArray(value) ? value : [value];
  return value;
}

function adaptField(fieldName, field, baselineField) {
  const status = CANONICAL_STATUSES.has(field.status) ? field.status : "unknown";
  const converted = status === "present" ? canonicalValue(fieldName, field.value) : null;
  const representable = status !== "present" || converted !== null;
  const canonicalStatus = representable ? status : "unknown";
  return {
    field: {
      raw_value: canonicalStatus === "present" ? (typeof field.value === "string" ? field.value : field.value?.display ?? JSON.stringify(field.value)) : null,
      normalized_value: canonicalStatus === "present" ? converted : null,
      value_status: canonicalStatus,
      confidence: baselineField?.confidence ?? 1,
      evidence_refs: mappedReferences(field.evidence_references),
      validation_errors: representable ? [] : ["p0_value_not_representable_in_canonical_v1"],
      inference: { is_inferred: false, reason: null },
    },
    representable,
    original_status: field.status,
  };
}

function locatorFromP0(evidence) {
  const locator = String(evidence.locator ?? "");
  const pageMatch = locator.match(/:page:(\d+):/u);
  const bboxMatch = locator.match(/:bbox:(\{.+\})$/u);
  let boundingBox = null;
  if (bboxMatch) {
    try {
      const parsed = JSON.parse(bboxMatch[1]);
      if (["x", "y", "width", "height", "unit"].every((key) => parsed[key] != null)) boundingBox = parsed;
    } catch {
      boundingBox = null;
    }
  }
  const title = locator.startsWith("notice:title");
  const bodyMatch = locator.match(/span:(\d+)-(\d+)$/u);
  return {
    page_number: pageMatch ? Number(pageMatch[1]) : null,
    section: title ? "heading" : locator.startsWith("notice:body") ? "body" : "attachment",
    html_selector: title ? "h1" : locator.startsWith("notice:body") ? (locator.match(/selector:([^:]+)/u)?.[1] ?? "main") : null,
    attribute_name: null,
    text_span: bodyMatch ? { start: Number(bodyMatch[1]), end: Number(bodyMatch[2]) } : null,
    table_coordinates: null,
    bounding_box: boundingBox,
  };
}

function canonicalSourceType(evidence, baselineRecord) {
  if (evidence.source_type !== "table_text") return evidence.source_type;
  const document = baselineRecord.source_documents.find((item) => item.document_id === evidence.document_id);
  return document?.media_type === "pdf" ? "pdf_text"
    : document?.media_type === "hwp" ? "hwp_text"
      : document?.media_type === "hwpx" ? "hwpx_text"
        : "html_text";
}

function adaptEvidence(evidence, baselineRecord, extractedAt) {
  const document = baselineRecord.source_documents.find((item) => item.document_id === evidence.document_id);
  return {
    evidence_id: mappedEvidenceId(evidence.evidence_id),
    source_type: canonicalSourceType(evidence, baselineRecord),
    source_notice_id: evidence.source_notice_id,
    document_id: evidence.document_id,
    document_revision_id: evidence.document_revision_id,
    document_hash: evidence.document_hash,
    attachment_url: null,
    locator: locatorFromP0(evidence),
    raw_text: evidence.source_text,
    normalized_text: evidence.source_text,
    extractor: {
      name: "engine-phase-4-p0-remediated-deterministic",
      version: "1.1.1",
      kind: "deterministic",
      model_provider: null,
      model_name: null,
      prompt_version: null,
    },
    parser_version: document?.parser_version ?? baselineRecord.extraction_metadata.parser_contract_version,
    inference_reason: null,
    manual_annotation_id: null,
    metadata: { original_p0_evidence_id: evidence.evidence_id, original_locator: evidence.locator, original_source_type: evidence.source_type },
    created_at: extractedAt,
  };
}

/**
 * Builds a canonical-v1 hybrid without claiming to be a full remediated
 * extractor. Non-P0 fields remain historical baseline values. P0 values that
 * canonical-v1 cannot express fail closed as unknown and remain losslessly
 * visible in p0_extensions outside the canonical record.
 */
export function buildP0RemediatedFullGateCRecord({ baselineRecord, remediatedOutput, extractedAt }) {
  const record = structuredClone(baselineRecord);
  const p0Evidence = remediatedOutput.evidence_references.map((item) => adaptEvidence(item, baselineRecord, extractedAt));
  const baselineEvidenceIds = new Set(record.evidence.map((item) => item.evidence_id));
  const collisions = p0Evidence.filter((item) => baselineEvidenceIds.has(item.evidence_id)).map((item) => item.evidence_id);
  if (collisions.length > 0) throw new Error(`P0 evidence ID collision: ${collisions.join(",")}`);
  record.evidence.push(...p0Evidence);

  const conversionDiagnostics = [];
  for (const [p0Name, canonicalName] of Object.entries(P0_TO_CANONICAL_FIELDS)) {
    const adapted = adaptField(p0Name, remediatedOutput.fields[p0Name], record.fields[canonicalName]);
    record.fields[canonicalName] = adapted.field;
    if (!adapted.representable || adapted.original_status === "schema_expressiveness_gap") {
      conversionDiagnostics.push({ field_name: p0Name, original_status: adapted.original_status, canonical_status: adapted.field.value_status, reason: "canonical_v1_representation_gap" });
    }
  }

  record.classification = {
    document_kind: remediatedOutput.classification.document_kind === "unknown_document" ? "unknown" : remediatedOutput.classification.document_kind,
    is_recruitment: remediatedOutput.classification.publishable_opportunity,
    confidence: baselineRecord.classification.confidence,
    evidence_refs: mappedReferences(remediatedOutput.classification.evidence_references),
  };

  record.program_identity_candidate = {
    ...record.program_identity_candidate,
    candidate_key: `unresolved|${record.source_notice_identity.notice_id}|p0-remediated`,
    resolution_status: "unresolved",
    provider_normalized: null,
    name_normalized: null,
    evidence_refs: [],
  };
  record.recruitment_cycle_identity_candidate = {
    ...record.recruitment_cycle_identity_candidate,
    candidate_key: `${record.program_identity_candidate.candidate_id}|unresolved|${record.source_notice_identity.notice_id}|p0-remediated`,
    resolution_status: "unresolved",
    cycle_label: null,
    evidence_refs: [],
  };

  const reasonCodes = [...new Set([
    ...baselineRecord.review.reason_codes,
    ...remediatedOutput.review.reasons,
    "program_identity_withheld_after_p0_remediation",
    "cycle_identity_withheld_after_p0_remediation",
  ])].sort();
  record.review = {
    required: baselineRecord.review.required || remediatedOutput.review.required || reasonCodes.length > 0,
    reason_codes: reasonCodes,
    automatic_publish_allowed: false,
    notification_allowed: false,
  };
  record.validation = {
    status: "review_required",
    errors: [...baselineRecord.validation.errors],
    warnings: [...new Set([...baselineRecord.validation.warnings, ...reasonCodes])].sort(),
  };
  record.extraction_metadata = {
    ...baselineRecord.extraction_metadata,
    extractor_name: "engine-phase-4-p0-remediated-hybrid-evaluation-adapter",
    extractor_version: "1.0.0",
    extracted_at: extractedAt,
  };

  return {
    record,
    p0_extensions: {
      institution_or_campus: structuredClone(remediatedOutput.fields.institution_or_campus),
      support_type: structuredClone(remediatedOutput.fields.support_type),
      original_p0_fields: structuredClone(remediatedOutput.fields),
    },
    evidence_id_map: Object.fromEntries(remediatedOutput.evidence_references.map((item) => [item.evidence_id, mappedEvidenceId(item.evidence_id)])),
    diagnostics: {
      evidence_id_collision_count: collisions.length,
      conversion_diagnostics: conversionDiagnostics,
      stale_program_candidate_count: record.program_identity_candidate.resolution_status === "proposed" ? 1 : 0,
      stale_cycle_candidate_count: record.recruitment_cycle_identity_candidate.resolution_status === "proposed" ? 1 : 0,
    },
  };
}

export const FULL_GATE_C_P0_FIELD_MAP = P0_TO_CANONICAL_FIELDS;
