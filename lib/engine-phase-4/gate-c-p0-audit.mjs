export const P0_AUDIT_VERSION = "engine-phase-4-gate-c-p0-audit/v1";
export const P0_AS_OF = "2026-07-20T00:00:00+09:00";
export const P0_TIMEZONE = "Asia/Seoul";
export const P0_FIELDS = [
  "program_name",
  "provider",
  "institution_or_campus",
  "application_start",
  "application_deadline",
  "lifecycle_status",
  "application_url",
  "support_type",
  "support_amount",
];
export const SAFETY_FIELDS = ["document_kind", "publishable_opportunity"];
export const EXTRA_OVERLAY_FIELDS = ["institution_or_campus", "lifecycle_status", "support_type"];
export const ALLOWED_LIFECYCLE_STATUSES = new Set(["upcoming", "open", "closed", "unknown"]);
const ALLOWED_REVIEWERS = new Set(["independent_human_reviewer", "second_independent_human_reviewer", "adjudication_lead"]);
const PRODUCTION_REVIEW_FIELD_STATUSES = new Set(["present", "not_found", "not_applicable", "unresolved", "schema_expressiveness_gap"]);
const PRODUCTION_REVIEW_SUPPORT_BASES = new Set(["frozen_excerpt_supported", "production_source_reviewed", "policy_decision", "schema_expressiveness_gap", "source_conflict", "unresolved_due_to_missing_reproducible_evidence"]);

const DECISION_FIELD_MAP = {
  program_name: "scholarship_program_name",
  provider: "provider",
  application_start: "application_start",
  application_deadline: "application_deadline",
  application_url: "application_url",
  support_amount: "amount",
  document_kind: "document_kind",
};

const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ratio = (numerator, denominator, reason) => denominator === 0
  ? { status: "not_evaluated", value: null, numerator: 0, denominator: 0, sample_count: 0, reason }
  : { status: "evaluated", value: numerator / denominator, numerator, denominator, sample_count: denominator };

function emptyOverlayField(fieldName) {
  return {
    field_name: fieldName,
    decision: "pending",
    adjudicated_gold: null,
    review_reason: null,
    reviewer_role: null,
    reviewed_at: null,
  };
}

export function buildInitialP0Overlay(corpus, adjudicationDecisions) {
  return {
    schema_version: P0_AUDIT_VERSION,
    source_fixture_version: corpus.fixture_version,
    source_adjudication_schema_version: adjudicationDecisions.schema_version,
    as_of: P0_AS_OF,
    timezone: P0_TIMEZONE,
    status: "pending_independent_review",
    note: "Only P0 fields absent from the full-field adjudication model live here. Existing adjudication decisions remain authoritative for mapped fields.",
    cases: corpus.cases.map((fixture) => ({
      case_id: fixture.case_id,
      fields: EXTRA_OVERLAY_FIELDS.map(emptyOverlayField),
    })),
  };
}

export function validateP0Overlay(corpus, decisions, overlay) {
  const errors = [];
  const expectedIds = corpus.cases.map((item) => item.case_id);
  const actualIds = overlay.cases?.map((item) => item.case_id) ?? [];
  if (overlay.schema_version !== P0_AUDIT_VERSION) errors.push("overlay schema version mismatch");
  if (overlay.source_fixture_version !== corpus.fixture_version) errors.push("overlay fixture version mismatch");
  if (overlay.source_adjudication_schema_version !== decisions.schema_version) errors.push("overlay adjudication schema version mismatch");
  if (overlay.as_of !== P0_AS_OF || overlay.timezone !== P0_TIMEZONE) errors.push("overlay as_of/timezone mismatch");
  if (!["pending_independent_review", "in_review", "completed"].includes(overlay.status)) errors.push("overlay status mismatch");
  if (actualIds.length !== expectedIds.length || new Set(actualIds).size !== actualIds.length) errors.push("overlay case count or uniqueness mismatch");
  for (const id of expectedIds) if (!actualIds.includes(id)) errors.push(`missing overlay case: ${id}`);
  for (const id of actualIds) if (!expectedIds.includes(id)) errors.push(`unknown overlay case: ${id}`);
  for (const item of overlay.cases ?? []) {
    const fixture = corpus.cases.find((candidate) => candidate.case_id === item.case_id);
    const retainedEvidenceIds = new Set(fixture?.gold_evidence?.map((entry) => entry.evidence_id) ?? []);
    const names = item.fields?.map((field) => field.field_name) ?? [];
    if (!deepEqual(names, EXTRA_OVERLAY_FIELDS)) errors.push(`${item.case_id}: overlay field membership/order mismatch`);
    for (const field of item.fields ?? []) {
      const label = `${item.case_id}/${field.field_name}`;
      if (!["pending", "resolved", "unresolved"].includes(field.decision)) errors.push(`${label}: invalid decision`);
      if (field.decision === "pending") {
        if (field.adjudicated_gold !== null || field.reviewer_role !== null || field.reviewed_at !== null) errors.push(`${label}: pending overlay decision contains review data`);
      } else {
        if (!ALLOWED_REVIEWERS.has(field.reviewer_role)) errors.push(`${label}: independent reviewer role required`);
        if (typeof field.reviewed_at !== "string" || Number.isNaN(Date.parse(field.reviewed_at))) errors.push(`${label}: reviewed_at required`);
        if (!field.review_reason) errors.push(`${label}: review_reason required`);
        if (!field.adjudicated_gold || !["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"].includes(field.adjudicated_gold.status)) errors.push(`${label}: adjudicated_gold required`);
        if (field.decision === "unresolved" && !["unknown", "ambiguous", "conflicting"].includes(field.adjudicated_gold?.status)) errors.push(`${label}: unresolved status must fail closed`);
        if (field.decision === "unresolved" && field.adjudicated_gold?.normalized_value !== null) errors.push(`${label}: unresolved value must be null`);
        for (const evidenceId of field.adjudicated_gold?.evidence_ids ?? []) if (!retainedEvidenceIds.has(evidenceId)) errors.push(`${label}: unknown retained evidence ID ${evidenceId}`);
        if (field.decision === "resolved" && field.adjudicated_gold?.status === "present" && !(field.adjudicated_gold?.evidence_ids?.length > 0)) errors.push(`${label}: resolved present value requires retained evidence`);
        if (field.field_name === "lifecycle_status" && field.decision === "resolved" && field.adjudicated_gold?.status === "present" && !ALLOWED_LIFECYCLE_STATUSES.has(field.adjudicated_gold.normalized_value)) errors.push(`${label}: invalid lifecycle value`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateProductionSourceReview(corpus, review) {
  const errors = [];
  const expectedCaseIds = corpus.cases.slice(5).map((item) => item.case_id);
  const actualCaseIds = review.cases?.map((item) => item.case_id) ?? [];
  if (review.schema_version !== "engine-phase-4-gate-c-p0-production-source-review/v1") errors.push("production review schema version mismatch");
  if (review.status !== "completed" || review.batch !== 2) errors.push("production review batch/status mismatch");
  if (review.reviewer_role !== "adjudication_lead" || typeof review.reviewed_at !== "string" || Number.isNaN(Date.parse(review.reviewed_at))) errors.push("production review metadata mismatch");
  if (review.p0_contract?.standalone_timezone_field !== false || review.p0_contract?.opportunity_field_count !== P0_FIELDS.length || review.p0_contract?.total_corpus_concept_slots !== corpus.cases.length * P0_FIELDS.length) errors.push("production review P0 contract mismatch");
  if (!deepEqual(actualCaseIds, expectedCaseIds)) errors.push("production review must contain Cases 6-24 exactly in frozen order");
  for (const item of review.cases ?? []) {
    const label = item.case_id;
    if (item.review_status !== "reviewed" || item.evidence_scope !== "production_source_review_scope") errors.push(`${label}: review state/scope mismatch`);
    if (item.reviewer_role !== review.reviewer_role || item.reviewed_at !== review.reviewed_at) errors.push(`${label}: reviewer metadata mismatch`);
    if (typeof item.document_kind !== "string" || typeof item.standalone_publishable !== "boolean") errors.push(`${label}: classification required`);
    const fieldNames = Object.keys(item.fields ?? {});
    if (!deepEqual(fieldNames, P0_FIELDS)) errors.push(`${label}: opportunity field membership/order mismatch`);
    if (Object.hasOwn(item.fields ?? {}, "timezone")) errors.push(`${label}: standalone timezone is forbidden`);
    for (const [fieldName, field] of Object.entries(item.fields ?? {})) {
      const fieldLabel = `${label}/${fieldName}`;
      if (!PRODUCTION_REVIEW_FIELD_STATUSES.has(field.status)) errors.push(`${fieldLabel}: invalid review status`);
      if (!Array.isArray(field.support_basis) || field.support_basis.length === 0 || field.support_basis.some((basis) => !PRODUCTION_REVIEW_SUPPORT_BASES.has(basis))) errors.push(`${fieldLabel}: invalid support basis`);
      if (field.status === "present" && field.normalized_value === null) errors.push(`${fieldLabel}: present value required`);
      if (["not_found", "not_applicable", "unresolved"].includes(field.status) && field.normalized_value !== null) errors.push(`${fieldLabel}: terminal null value required`);
      if (field.status === "unresolved" && !field.support_basis.includes("unresolved_due_to_missing_reproducible_evidence")) errors.push(`${fieldLabel}: unresolved evidence basis required`);
      if (field.status === "schema_expressiveness_gap" && !field.support_basis.includes("schema_expressiveness_gap")) errors.push(`${fieldLabel}: schema gap basis required`);
    }
    if (item.terminal_non_opportunity && (item.standalone_publishable || !Object.values(item.fields).every((field) => field.status === "not_applicable"))) errors.push(`${label}: terminal non-opportunity must stop downstream fields`);
  }
  return { valid: errors.length === 0, errors };
}

export function summarizeProductionSourceReview(corpus, review) {
  const fields = review.cases.flatMap((item) => P0_FIELDS.map((fieldName) => ({ case_id: item.case_id, field_name: fieldName, ...item.fields[fieldName] })));
  const countStatus = (status) => fields.filter((item) => item.status === status).length;
  const supportAmountFields = fields.filter((item) => item.field_name === "support_amount");
  const amountTaxonomy = {};
  for (const item of supportAmountFields) {
    const kind = item.normalized_value?.kind ?? item.status;
    amountTaxonomy[kind] = (amountTaxonomy[kind] ?? 0) + 1;
  }
  const dateFields = fields.filter((item) => ["application_start", "application_deadline"].includes(item.field_name));
  return {
    batch: review.batch,
    status: review.status,
    reviewed_case_count: review.cases.length,
    combined_p0_case_review_count: 5 + review.cases.length,
    total_corpus_concept_slots: corpus.cases.length * P0_FIELDS.length,
    production_review_concept_slots: fields.length,
    status_counts: Object.fromEntries([...PRODUCTION_REVIEW_FIELD_STATUSES].map((status) => [status, countStatus(status)])),
    frozen_excerpt_supported_field_count: fields.filter((item) => item.support_basis.includes("frozen_excerpt_supported")).length,
    production_source_only_field_count: fields.filter((item) => item.support_basis.includes("production_source_reviewed") && !item.support_basis.includes("frozen_excerpt_supported")).length,
    terminal_non_opportunity_case_ids: review.cases.filter((item) => item.terminal_non_opportunity).map((item) => item.case_id),
    standalone_non_publishable_case_ids: review.cases.filter((item) => !item.standalone_publishable).map((item) => item.case_id),
    schema_gap_case_ids: [...new Set(fields.filter((item) => item.status === "schema_expressiveness_gap").map((item) => item.case_id))],
    date_normalization: {
      reviewed_field_count: dateFields.length,
      applicable_field_count: dateFields.filter((item) => item.status !== "not_applicable").length,
      present_count: dateFields.filter((item) => item.status === "present").length,
      date_only_count: dateFields.filter((item) => typeof item.normalized_value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(item.normalized_value)).length,
      offset_datetime_count: dateFields.filter((item) => typeof item.normalized_value === "string" && /T\d{2}:\d{2}:\d{2}\+\d{2}:\d{2}$/u.test(item.normalized_value)).length,
      unresolved_or_not_found_count: dateFields.filter((item) => ["unresolved", "not_found"].includes(item.status)).length,
      not_applicable_count: dateFields.filter((item) => item.status === "not_applicable").length,
    },
    amount_semantics: {
      reviewed_field_count: supportAmountFields.length,
      applicable_field_count: supportAmountFields.filter((item) => item.status !== "not_applicable").length,
      semantically_resolved_count: supportAmountFields.filter((item) => ["present", "schema_expressiveness_gap"].includes(item.status)).length,
      canonical_schema_representable_count: supportAmountFields.filter((item) => item.status === "present").length,
      taxonomy_counts: amountTaxonomy,
      schema_gap_count: supportAmountFields.filter((item) => item.status === "schema_expressiveness_gap").length,
      unresolved_count: supportAmountFields.filter((item) => item.status === "unresolved").length,
      not_applicable_count: supportAmountFields.filter((item) => item.status === "not_applicable").length,
    },
  };
}

function snapshotFromDecision(fieldDecision) {
  if (!fieldDecision || ["pending", "not_reviewed"].includes(fieldDecision.decision)) return { state: "pending", gold: null };
  const independentlyReviewed = ALLOWED_REVIEWERS.has(fieldDecision.reviewer_role)
    && typeof fieldDecision.reviewed_at === "string"
    && !Number.isNaN(Date.parse(fieldDecision.reviewed_at));
  if (!independentlyReviewed) return { state: "pending", gold: null };
  if (fieldDecision.decision === "approved") return { state: "resolved", gold: fieldDecision.candidate_gold };
  if (fieldDecision.decision === "corrected") return { state: "resolved", gold: fieldDecision.adjudicated_gold };
  return { state: "unresolved", gold: fieldDecision.adjudicated_gold };
}

function overlaySnapshot(overlayCase, fieldName) {
  const decision = overlayCase.fields.find((item) => item.field_name === fieldName);
  if (decision.decision === "pending") return { state: "pending", gold: null };
  return { state: decision.decision, gold: decision.adjudicated_gold };
}

function goldForField(caseDecision, overlayCase, fieldName) {
  if (EXTRA_OVERLAY_FIELDS.includes(fieldName)) return overlaySnapshot(overlayCase, fieldName);
  if (fieldName === "publishable_opportunity") {
    const kind = snapshotFromDecision(caseDecision.fields.find((item) => item.field_name === "document_kind"));
    if (kind.state !== "resolved") return kind;
    return { state: "resolved", gold: { status: "present", normalized_value: kind.gold.normalized_value === "recruitment_notice", evidence_ids: kind.gold.evidence_ids ?? [] } };
  }
  return snapshotFromDecision(caseDecision.fields.find((item) => item.field_name === DECISION_FIELD_MAP[fieldName]));
}

function predictionFromCanonicalField(field) {
  return {
    status: field?.value_status ?? "not_found",
    normalized_value: field?.normalized_value ?? null,
    evidence_ids: field?.evidence_refs ?? [],
    inferred: field?.inference?.is_inferred === true,
  };
}

function datePrediction(field) {
  const prediction = predictionFromCanonicalField(field);
  if (prediction.status !== "present" || !prediction.normalized_value || typeof prediction.normalized_value !== "object") return prediction;
  return {
    ...prediction,
    normalized_value: prediction.normalized_value.datetime ?? prediction.normalized_value.date ?? prediction.normalized_value,
  };
}

function predictionForField(record, fieldName) {
  const canonical = {
    program_name: record.fields.scholarship_program_name,
    provider: record.fields.provider,
    institution_or_campus: record.fields.host_institution,
    application_start: record.fields.application_start,
    application_deadline: record.fields.application_deadline,
    lifecycle_status: record.fields.status,
    application_url: record.fields.application_url,
    support_type: record.fields.benefit_type,
    support_amount: record.fields.amount,
  };
  if (fieldName === "application_start" || fieldName === "application_deadline") return datePrediction(canonical[fieldName]);
  if (fieldName === "document_kind") return { status: "present", normalized_value: record.classification.document_kind, evidence_ids: record.classification.evidence_refs, inferred: false };
  if (fieldName === "publishable_opportunity") return { status: "present", normalized_value: record.classification.is_recruitment, evidence_ids: record.classification.evidence_refs, inferred: false };
  return predictionFromCanonicalField(canonical[fieldName]);
}

function summarizeObservations(observations, fieldName) {
  const resolved = observations.filter((item) => item.gold_state === "resolved");
  const scorablePresence = resolved.filter((item) => ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"].includes(item.gold.status));
  const goldPresent = scorablePresence.filter((item) => item.gold.status === "present");
  const predictedPresent = scorablePresence.filter((item) => item.prediction.status === "present");
  const truePresent = scorablePresence.filter((item) => item.gold.status === "present" && item.prediction.status === "present");
  const jointlyPresent = truePresent;
  return {
    resolved_count: resolved.length,
    pending_count: observations.filter((item) => item.gold_state === "pending").length,
    unresolved_count: observations.filter((item) => item.gold_state === "unresolved").length,
    field_presence_precision: ratio(truePresent.length, predictedPresent.length, `No reviewer-resolved predicted-present samples for ${fieldName}.`),
    field_presence_recall: ratio(truePresent.length, goldPresent.length, `No reviewer-resolved gold-present samples for ${fieldName}.`),
    normalized_exact_match: ratio(jointlyPresent.filter((item) => deepEqual(item.gold.normalized_value, item.prediction.normalized_value)).length, jointlyPresent.length, `No jointly present reviewer-resolved samples for ${fieldName}.`),
    exact: ratio(resolved.filter((item) => item.gold.status === item.prediction.status && deepEqual(item.gold.normalized_value, item.prediction.normalized_value)).length, resolved.length, `No reviewer-resolved samples for ${fieldName}.`),
    evidence_supported_count: observations.filter((item) => item.prediction.status === "present" && item.prediction.evidence_ids.length > 0).length,
    unsupported_claim_count: observations.filter((item) => item.prediction.status === "present" && item.prediction.evidence_ids.length === 0).length,
    inferred_value_count: observations.filter((item) => item.prediction.status === "present" && item.prediction.inferred).length,
    ambiguous_or_review_required_count: observations.filter((item) => ["ambiguous", "conflicting", "unknown"].includes(item.prediction.status)).length,
  };
}

export function evaluateP0Audit({ corpus, adjudicationDecisions, overlay, recordsByCase, productionSourceReview = null }) {
  const observations = [];
  const criticalErrors = [];
  const caseResults = [];
  for (const fixture of corpus.cases) {
    const caseDecision = adjudicationDecisions.cases.find((item) => item.case_id === fixture.case_id);
    const overlayCase = overlay.cases.find((item) => item.case_id === fixture.case_id);
    const record = recordsByCase.get(fixture.case_id);
    const caseObservations = [...P0_FIELDS, ...SAFETY_FIELDS].map((fieldName) => {
      const gold = goldForField(caseDecision, overlayCase, fieldName);
      const prediction = predictionForField(record, fieldName);
      return { case_id: fixture.case_id, field_name: fieldName, gold_state: gold.state, gold: gold.gold, prediction };
    });
    observations.push(...caseObservations);
    const lifecycle = caseObservations.find((item) => item.field_name === "lifecycle_status").prediction;
    const lifecycleObservation = caseObservations.find((item) => item.field_name === "lifecycle_status");
    if (lifecycle.status === "present" && !ALLOWED_LIFECYCLE_STATUSES.has(lifecycle.normalized_value)) {
      criticalErrors.push({ case_id: fixture.case_id, field_name: "lifecycle_status", error: "document_kind_used_as_lifecycle_status", predicted_value: lifecycle.normalized_value, classification: "deterministic_extractor_defect", gold_state: lifecycleObservation.gold_state, verified_against_gold: lifecycleObservation.gold_state === "resolved" });
    }
    for (const item of caseObservations.filter((entry) => entry.prediction.status === "present" && entry.prediction.evidence_ids.length === 0)) {
      criticalErrors.push({ case_id: fixture.case_id, field_name: item.field_name, error: "unsupported_present_claim", predicted_value: item.prediction.normalized_value, classification: "deterministic_extractor_defect", gold_state: item.gold_state, verified_against_gold: item.gold_state === "resolved" });
    }
    const publishability = caseObservations.find((item) => item.field_name === "publishable_opportunity");
    if (publishability.gold_state === "resolved" && publishability.gold?.status === "present" && publishability.prediction.status === "present" && publishability.gold.normalized_value !== publishability.prediction.normalized_value) {
      criticalErrors.push({
        case_id: fixture.case_id,
        field_name: "publishable_opportunity",
        error: publishability.prediction.normalized_value ? "non_recruitment_exposed_as_opportunity" : "recruitment_suppressed",
        predicted_value: publishability.prediction.normalized_value,
        classification: "deterministic_extractor_defect",
        gold_state: "resolved",
        verified_against_gold: true,
      });
    }
    const p0CaseObservations = caseObservations.filter((item) => P0_FIELDS.includes(item.field_name));
    const allP0Resolved = p0CaseObservations.every((item) => item.gold_state === "resolved");
    const exactP0Count = p0CaseObservations.filter((item) => item.gold_state === "resolved" && item.gold.status === item.prediction.status && deepEqual(item.gold.normalized_value, item.prediction.normalized_value)).length;
    const resolvedP0Count = p0CaseObservations.filter((item) => item.gold_state === "resolved").length;
    const pendingP0Count = p0CaseObservations.filter((item) => item.gold_state === "pending").length;
    const unresolvedP0Count = p0CaseObservations.filter((item) => item.gold_state === "unresolved").length;
    const outcome = !allP0Resolved ? "pending" : exactP0Count === p0CaseObservations.length ? "fully_correct" : exactP0Count > 0 ? "partially_correct" : "failed";
    const adjudicationCoverage = allP0Resolved
      ? "fully_resolved"
      : resolvedP0Count === 0 && unresolvedP0Count === 0
        ? "fully_pending"
        : "partially_resolved";
    caseResults.push({
      case_id: fixture.case_id,
      resolved_p0_field_count: resolvedP0Count,
      unresolved_p0_field_count: unresolvedP0Count,
      pending_p0_field_count: pendingP0Count,
      resolved_safety_field_count: caseObservations.filter((item) => SAFETY_FIELDS.includes(item.field_name) && item.gold_state === "resolved").length,
      unresolved_safety_field_count: caseObservations.filter((item) => SAFETY_FIELDS.includes(item.field_name) && item.gold_state === "unresolved").length,
      pending_safety_field_count: caseObservations.filter((item) => SAFETY_FIELDS.includes(item.field_name) && item.gold_state === "pending").length,
      adjudication_coverage: adjudicationCoverage,
      outcome,
      review_required: record.review.required,
    });
  }

  const p0Observations = observations.filter((item) => P0_FIELDS.includes(item.field_name));
  const byField = Object.fromEntries([...P0_FIELDS, ...SAFETY_FIELDS].map((fieldName) => [fieldName, summarizeObservations(observations.filter((item) => item.field_name === fieldName), fieldName)]));
  const resolvedP0 = p0Observations.filter((item) => item.gold_state === "resolved");
  const resolvedPresentGold = resolvedP0.filter((item) => item.gold.status === "present");
  const resolvedPredictedPresent = resolvedP0.filter((item) => item.prediction.status === "present");
  const resolvedTruePresent = resolvedP0.filter((item) => item.gold.status === "present" && item.prediction.status === "present");
  const exactByCategory = (fieldName) => byField[fieldName].exact;
  const publishability = observations.filter((item) => item.field_name === "publishable_opportunity" && item.gold_state === "resolved");
  const nonRecruitmentExposed = publishability.filter((item) => item.gold.status === "present" && item.gold.normalized_value === false && item.prediction.status === "present" && item.prediction.normalized_value === true);
  const recruitmentSuppressed = publishability.filter((item) => item.gold.status === "present" && item.gold.normalized_value === true && item.prediction.status === "present" && item.prediction.normalized_value === false);
  const taxonomy = Object.fromEntries([...new Set(criticalErrors.map((item) => item.classification))].map((classification) => [classification, { count: criticalErrors.filter((item) => item.classification === classification).length, case_ids: [...new Set(criticalErrors.filter((item) => item.classification === classification).map((item) => item.case_id))] }]));
  return {
    audit_version: P0_AUDIT_VERSION,
    official_phase: "ENGINE_PHASE_4",
    official_gate: "GATE_C_P0_DIAGNOSTIC_AUDIT",
    as_of: P0_AS_OF,
    timezone: P0_TIMEZONE,
    gold_policy: "frozen-excerpt correctness uses reviewer-approved adjudication decisions only; production-source review is reported separately; candidate, pending, and production-source-only values are excluded from frozen correctness denominators",
    p0_contract: {
      opportunity_fields: P0_FIELDS,
      standalone_timezone_field: false,
      total_concept_slots: corpus.cases.length * P0_FIELDS.length,
      primary_application_window_only: true,
      terminal_non_opportunity_downstream_fields_excluded: true,
    },
    evidence_scopes: {
      frozen_excerpt_scope: "scorable in resolved-only deterministic accuracy",
      production_source_review_scope: "shadow operational review; never inserted into frozen-excerpt accuracy denominators",
    },
    corpus: {
      total_case_count: corpus.cases.length,
      resolved_case_count: caseResults.filter((item) => item.adjudication_coverage === "fully_resolved").length,
      partially_resolved_case_count: caseResults.filter((item) => item.adjudication_coverage === "partially_resolved").length,
      fully_pending_case_count: caseResults.filter((item) => item.adjudication_coverage === "fully_pending").length,
      pending_case_count: caseResults.filter((item) => item.pending_p0_field_count > 0).length,
      total_p0_field_count: p0Observations.length,
      resolved_p0_field_count: resolvedP0.length,
      pending_p0_field_count: p0Observations.filter((item) => item.gold_state === "pending").length,
      unresolved_p0_field_count: p0Observations.filter((item) => item.gold_state === "unresolved").length,
      resolved_safety_field_count: observations.filter((item) => SAFETY_FIELDS.includes(item.field_name) && item.gold_state === "resolved").length,
      pending_safety_field_count: observations.filter((item) => SAFETY_FIELDS.includes(item.field_name) && item.gold_state === "pending").length,
    },
    aggregate_metrics: {
      field_presence_precision: ratio(resolvedTruePresent.length, resolvedPredictedPresent.length, "No reviewer-resolved P0 predicted-present samples."),
      field_presence_recall: ratio(resolvedTruePresent.length, resolvedPresentGold.length, "No reviewer-resolved P0 gold-present samples."),
      normalized_exact_match: ratio(resolvedTruePresent.filter((item) => deepEqual(item.gold.normalized_value, item.prediction.normalized_value)).length, resolvedTruePresent.length, "No jointly present reviewer-resolved P0 samples."),
      evidence_supported_count: p0Observations.filter((item) => item.prediction.status === "present" && item.prediction.evidence_ids.length > 0).length,
      unsupported_claim_count: p0Observations.filter((item) => item.prediction.status === "present" && item.prediction.evidence_ids.length === 0).length,
      inferred_value_count: p0Observations.filter((item) => item.prediction.status === "present" && item.prediction.inferred).length,
      ambiguous_or_review_required_count: p0Observations.filter((item) => ["ambiguous", "conflicting", "unknown"].includes(item.prediction.status)).length,
      review_required_case_count: caseResults.filter((item) => item.review_required).length,
    },
    category_metrics: {
      identity_exact: exactByCategory("program_name"),
      provider_exact: exactByCategory("provider"),
      institution_or_campus_exact: exactByCategory("institution_or_campus"),
      application_start_exact: exactByCategory("application_start"),
      application_deadline_exact: exactByCategory("application_deadline"),
      status_exact: exactByCategory("lifecycle_status"),
      application_url_exact: exactByCategory("application_url"),
      support_type_exact: exactByCategory("support_type"),
      support_amount_exact: exactByCategory("support_amount"),
    },
    safety_gates: {
      document_kind_exact: exactByCategory("document_kind"),
      non_recruitment_exposed_as_opportunity_count: nonRecruitmentExposed.length,
      recruitment_suppressed_count: recruitmentSuppressed.length,
      critical_publishability_error_count: nonRecruitmentExposed.length + recruitmentSuppressed.length,
      pending_publishability_case_count: observations.filter((item) => item.field_name === "publishable_opportunity" && item.gold_state === "pending").length,
      note: "Publishability mismatch counts require reviewer-resolved document-kind gold; pending cases are not scored as safe or erroneous.",
    },
    case_metrics: {
      fully_correct_p0_case_count: caseResults.filter((item) => item.outcome === "fully_correct").length,
      partially_correct_p0_case_count: caseResults.filter((item) => item.outcome === "partially_correct").length,
      failed_p0_case_count: caseResults.filter((item) => item.outcome === "failed").length,
      pending_p0_case_count: caseResults.filter((item) => item.outcome === "pending").length,
      partially_adjudicated_p0_case_count: caseResults.filter((item) => item.adjudication_coverage === "partially_resolved").length,
      fully_pending_p0_case_count: caseResults.filter((item) => item.adjudication_coverage === "fully_pending").length,
    },
    by_field: byField,
    critical_errors: criticalErrors,
    error_taxonomy: taxonomy,
    responsibility_boundary: {
      deterministic_fields: ["explicit primary application window with embedded offset/timezone", "explicit provider/program labels", "explicit application URL", "simple exact/cap/range/period/unit amount semantics", "conservative document classification", "lifecycle derivation from unambiguous start/deadline/timezone for a confirmed recruitment opportunity at fixed as_of"],
      llm_assisted_candidates: ["provider/program separation", "complex date roles and process timeline", "cross-table amount component/program alignment", "complex Korean eligibility and exceptions outside P0"],
      human_review_required: ["publishability", "lifecycle when date roles or timezone are ambiguous, dates conflict, multiple cycles are possible, or correction/extension/result relations are required", "correction/extension/result semantics", "campus scope", "ambiguous or conflicting values"],
      schema_expressiveness_gaps: ["lifecycle status has no enum and currently accepts document-kind values", "tiered, composite, recurring, hourly, applicant-requested, and multi-program amounts do not fit one amountValue", "host institution and benefit type are optional and absent from the baseline output"],
      input_minimization: ["use HTML when it already contains P0 facts", "require full HWP/HWPX parsing only when P0 is absent from accessible HTML", "use minimal OCR/vision for image-only program, primary application window, amount, and application path", "defer detailed eligibility and follow-up procedure semantics to LLM-assisted draft plus administrator review"],
    },
    safety: { external_llm_called: false, production_db_touched: false, extractor_modified_for_score: false, existing_gate_c_report_replaced: false, automatic_publish_enabled: false },
    production_source_review: productionSourceReview ? summarizeProductionSourceReview(corpus, productionSourceReview) : null,
    reviewer_resolved_field_results: observations
      .filter((item) => item.gold_state === "resolved")
      .map((item) => ({
        case_id: item.case_id,
        field_name: item.field_name,
        gold: item.gold,
        prediction: item.prediction,
        exact: item.gold.status === item.prediction.status && deepEqual(item.gold.normalized_value, item.prediction.normalized_value),
      })),
    case_results: caseResults,
  };
}
