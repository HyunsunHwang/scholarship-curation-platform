export const P0_AUDIT_VERSION = "engine-phase-4-gate-c-p0-audit/v1";
export const P0_AS_OF = "2026-07-20T00:00:00+09:00";
export const P0_TIMEZONE = "Asia/Seoul";
export const P0_FIELDS = [
  "program_name",
  "provider",
  "institution_or_campus",
  "application_start",
  "application_deadline",
  "timezone",
  "lifecycle_status",
  "application_url",
  "support_type",
  "support_amount",
];
export const SAFETY_FIELDS = ["document_kind", "publishable_opportunity"];
export const EXTRA_OVERLAY_FIELDS = ["institution_or_campus", "lifecycle_status", "support_type"];
export const ALLOWED_LIFECYCLE_STATUSES = new Set(["upcoming", "open", "closed", "unknown"]);
const ALLOWED_REVIEWERS = new Set(["independent_human_reviewer", "second_independent_human_reviewer", "adjudication_lead"]);

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
  if (actualIds.length !== expectedIds.length || new Set(actualIds).size !== actualIds.length) errors.push("overlay case count or uniqueness mismatch");
  for (const id of expectedIds) if (!actualIds.includes(id)) errors.push(`missing overlay case: ${id}`);
  for (const id of actualIds) if (!expectedIds.includes(id)) errors.push(`unknown overlay case: ${id}`);
  for (const item of overlay.cases ?? []) {
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
      }
    }
  }
  return { valid: errors.length === 0, errors };
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

function dateTimezoneSnapshot(snapshot) {
  if (!snapshot || snapshot.state !== "resolved") return snapshot?.state === "unresolved" ? snapshot : { state: "pending", gold: null };
  const normalized = snapshot.gold?.normalized_value;
  if (snapshot.gold?.status !== "present") return { state: "resolved", gold: { status: snapshot.gold.status, normalized_value: null, evidence_ids: snapshot.gold.evidence_ids ?? [] } };
  if (typeof normalized === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return { state: "resolved", gold: { status: "not_applicable", normalized_value: null, evidence_ids: snapshot.gold.evidence_ids ?? [] } };
    if (/(?:\+09:00|Z)$/u.test(normalized)) return { state: "resolved", gold: { status: "present", normalized_value: P0_TIMEZONE, evidence_ids: snapshot.gold.evidence_ids ?? [] } };
  }
  if (normalized?.timezone) return { state: "resolved", gold: { status: "present", normalized_value: normalized.timezone === "+09:00" ? P0_TIMEZONE : normalized.timezone, evidence_ids: snapshot.gold.evidence_ids ?? [] } };
  return { state: "unresolved", gold: { status: "unknown", normalized_value: null, evidence_ids: snapshot.gold?.evidence_ids ?? [] } };
}

function overlaySnapshot(overlayCase, fieldName) {
  const decision = overlayCase.fields.find((item) => item.field_name === fieldName);
  if (decision.decision === "pending") return { state: "pending", gold: null };
  return { state: decision.decision, gold: decision.adjudicated_gold };
}

function goldForField(caseDecision, overlayCase, fieldName) {
  if (EXTRA_OVERLAY_FIELDS.includes(fieldName)) return overlaySnapshot(overlayCase, fieldName);
  if (fieldName === "timezone") {
    const deadline = snapshotFromDecision(caseDecision.fields.find((item) => item.field_name === "application_deadline"));
    const start = snapshotFromDecision(caseDecision.fields.find((item) => item.field_name === "application_start"));
    return dateTimezoneSnapshot(deadline.state === "resolved" ? deadline : start);
  }
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

function timezonePrediction(record) {
  const candidates = [record.fields.application_deadline, record.fields.application_start];
  for (const field of candidates) {
    if (field?.value_status !== "present") continue;
    const normalized = field.normalized_value;
    if (normalized?.kind === "exact_date") return { status: "not_applicable", normalized_value: null, evidence_ids: field.evidence_refs ?? [], inferred: false };
    if (normalized?.timezone) return { status: "present", normalized_value: normalized.timezone === "+09:00" ? P0_TIMEZONE : normalized.timezone, evidence_ids: field.evidence_refs ?? [], inferred: normalized.inferred === true };
  }
  return { status: "not_found", normalized_value: null, evidence_ids: [], inferred: false };
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
  if (fieldName === "timezone") return timezonePrediction(record);
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

export function evaluateP0Audit({ corpus, adjudicationDecisions, overlay, recordsByCase }) {
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
    const allResolved = caseObservations.every((item) => item.gold_state === "resolved");
    const exactCount = caseObservations.filter((item) => item.gold_state === "resolved" && item.gold.status === item.prediction.status && deepEqual(item.gold.normalized_value, item.prediction.normalized_value)).length;
    const resolvedCount = caseObservations.filter((item) => item.gold_state === "resolved").length;
    const outcome = !allResolved ? "pending" : exactCount === caseObservations.length ? "fully_correct" : exactCount > 0 ? "partially_correct" : "failed";
    caseResults.push({ case_id: fixture.case_id, resolved_audit_field_count: resolvedCount, pending_audit_field_count: caseObservations.length - resolvedCount, outcome, review_required: record.review.required });
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
    gold_policy: "reviewer-approved adjudication decisions only; candidate and pending values are excluded from correctness denominators",
    corpus: {
      total_case_count: corpus.cases.length,
      resolved_case_count: caseResults.filter((item) => item.pending_audit_field_count === 0).length,
      pending_case_count: caseResults.filter((item) => item.pending_audit_field_count > 0).length,
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
      timezone_exact: exactByCategory("timezone"),
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
    },
    by_field: byField,
    critical_errors: criticalErrors,
    error_taxonomy: taxonomy,
    responsibility_boundary: {
      deterministic_fields: ["explicit application dates", "explicit provider/program labels", "explicit application URL", "simple amount", "conservative document classification"],
      llm_assisted_candidates: ["provider/program separation", "complex date roles", "tiered or non-cash support", "complex eligibility outside P0"],
      human_review_required: ["lifecycle status", "publishability", "correction/extension/result semantics", "campus scope", "ambiguous or conflicting values"],
      schema_expressiveness_gaps: ["lifecycle status has no enum and currently accepts document-kind values", "tiered amount rows do not fit one amountValue", "host institution and benefit type are optional and absent from the baseline output"],
    },
    safety: { external_llm_called: false, production_db_touched: false, extractor_modified_for_score: false, existing_gate_c_report_replaced: false, automatic_publish_enabled: false },
    case_results: caseResults,
  };
}
