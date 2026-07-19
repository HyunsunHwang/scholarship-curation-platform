import crypto from "node:crypto";

export const ADJUDICATION_SCHEMA_VERSION = "engine-phase-4-gate-c-adjudication/v1";
export const ADJUDICATION_CREATED_AT = "2026-07-19T12:00:00Z";
export const ALLOWED_REVIEWER_ROLES = new Set([
  "independent_human_reviewer",
  "second_independent_human_reviewer",
  "adjudication_lead",
]);
export const TERMINAL_FIELD_DECISIONS = new Set(["approved", "corrected", "unresolved"]);
export const TERMINAL_CASE_DECISIONS = new Set(["approved", "corrected", "unresolved", "excluded_for_provenance_failure"]);
export const TERMINAL_PARTIAL_DECISIONS = new Set(["approved", "corrected", "unresolved", "not_adjudicable_with_current_evidence"]);

const P0_FIELDS = new Set(["document_kind", "provider", "scholarship_program_name", "recruitment_cycle_label", "status"]);
const P1_FIELDS = new Set(["application_start", "application_deadline", "eligibility", "required_documents", "application_method"]);
const PHASE_4C_REASON_FIELDS = {
  provider_program_separation: ["provider", "scholarship_program_name"],
  program_identity_insufficient: ["scholarship_program_name"],
  cycle_evidence_missing: ["recruitment_cycle_label"],
  unlabeled_date_role: ["application_start", "application_deadline"],
  multiple_date_conflict: ["application_start", "application_deadline"],
  complex_eligibility: ["eligibility"],
  required_document_taxonomy: ["required_documents"],
  application_method_taxonomy: ["application_method"],
  tiered_amount_table: ["amount"],
  multiple_benefit_conflict: ["amount"],
};

export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const deepClone = (value) => JSON.parse(JSON.stringify(value));
const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function candidateSnapshot(fixture, fieldName) {
  if (fieldName === "document_kind") {
    return {
      status: "present",
      normalized_value: fixture.document_kind_gold,
      evidence_ids: fixture.gold_evidence.map((item) => item.evidence_id),
    };
  }
  const candidate = fixture.gold_fields[fieldName];
  return {
    status: candidate.value_status,
    normalized_value: candidate.normalized_value,
    evidence_ids: candidate.evidence_refs,
  };
}

export function priorityForField(fixture, fieldName) {
  const candidate = fieldName === "document_kind" ? null : fixture.gold_fields[fieldName];
  if (P0_FIELDS.has(fieldName) || ["ambiguous", "conflicting"].includes(candidate?.value_status)) return "P0";
  if (P1_FIELDS.has(fieldName) || candidate?.partial_match_policy) return "P1";
  if (fieldName === "amount" && fixture.gold_review_reason_codes.some((code) => ["tiered_amount_table", "multiple_benefit_conflict"].includes(code))) return "P1";
  return "P2";
}

function fieldDecision(fixture, fieldName) {
  const candidate = candidateSnapshot(fixture, fieldName);
  return {
    field_name: fieldName,
    priority: priorityForField(fixture, fieldName),
    decision: "pending",
    candidate_gold: candidate,
    candidate_gold_sha256: sha256(JSON.stringify(candidate)),
    adjudicated_gold: null,
    review_reason: null,
    reviewer_role: null,
    reviewed_at: null,
  };
}

function partialDecision(partial) {
  return {
    field_name: partial.field,
    priority: "P1",
    decision: "pending_independent_review",
    candidate_partial_policy: { policy: partial.policy, threshold: partial.threshold },
    adjudicated_partial_gold: null,
    review_reason: null,
    reviewer_role: null,
    reviewed_at: null,
  };
}

function relationDecision(fixture, group) {
  return {
    relation_id: `${group.group_id}:${fixture.case_id}`,
    group_id: group.group_id,
    priority: "P0",
    decision: "pending",
    candidate_relation: {
      relation_type: group.relation_type,
      pairs: group.pairs.filter((pair) => pair.left === fixture.case_id || pair.right === fixture.case_id),
      coverage_limitation: group.coverage_limitation ?? null,
    },
    adjudicated_relation: null,
    review_reason: null,
    reviewer_role: null,
    reviewed_at: null,
  };
}

export function buildInitialAdjudicationDecisions(corpus, relations, sourceManifestHash) {
  const relationById = new Map(relations.groups.map((group) => [group.group_id, group]));
  return {
    schema_version: ADJUDICATION_SCHEMA_VERSION,
    source_fixture_version: corpus.fixture_version,
    source_case_manifest_hash: sourceManifestHash,
    adjudication_status: "pending_independent_review",
    independent_reviewer_required: true,
    cases: corpus.cases.map((fixture) => ({
      case_id: fixture.case_id,
      source_capture_hash: fixture.source_capture_hash,
      case_priority: "P0",
      decision: "pending_independent_review",
      review_reason: null,
      reviewer_role: null,
      reviewed_at: null,
      suggested_review_issues: fixture.gold_review_reason_codes.map((reason) => ({
        kind: "suspected_candidate_gold_problem",
        reason,
        disposition: "requires_independent_decision",
      })),
      fields: ["document_kind", ...Object.keys(fixture.gold_fields)].map((fieldName) => fieldDecision(fixture, fieldName)),
      partial_decisions: fixture.partial_gold.map(partialDecision),
      relation_decisions: fixture.relation_group_ids.map((groupId) => relationDecision(fixture, relationById.get(groupId))),
    })),
  };
}

function expectedCaseDecision(fixture, relations) {
  return buildInitialAdjudicationDecisions(
    { fixture_version: "comparison", cases: [fixture] },
    relations,
    "comparison",
  ).cases[0];
}

function reviewedMetadataValid(item, errors, label) {
  if (!ALLOWED_REVIEWER_ROLES.has(item.reviewer_role)) errors.push(`${label}: reviewer_role must identify an independent human reviewer`);
  if (typeof item.reviewed_at !== "string" || Number.isNaN(Date.parse(item.reviewed_at))) errors.push(`${label}: reviewed_at must be an ISO-8601 timestamp`);
}

function validateFieldSemantics(item, fixture, errors, label) {
  if (["pending", "not_reviewed"].includes(item.decision)) {
    if (item.reviewer_role !== null || item.reviewed_at !== null) errors.push(`${label}: pending field must not have reviewer metadata`);
    return;
  }
  reviewedMetadataValid(item, errors, label);
  if (item.decision === "corrected") {
    if (!item.review_reason) errors.push(`${label}: corrected field requires review_reason`);
    if (!item.adjudicated_gold) errors.push(`${label}: corrected field requires adjudicated_gold`);
    if (!item.adjudicated_gold?.evidence_ids?.length) errors.push(`${label}: corrected field requires evidence_ids`);
    if (item.adjudicated_gold && deepEqual(item.adjudicated_gold, item.candidate_gold)) errors.push(`${label}: corrected field must record an actual status or value change`);
  }
  if (item.decision === "unresolved") {
    if (!item.review_reason) errors.push(`${label}: unresolved field requires review_reason`);
    if (!["unknown", "ambiguous", "conflicting"].includes(item.adjudicated_gold?.status)) errors.push(`${label}: unresolved field requires unknown, ambiguous, or conflicting status`);
    if (item.adjudicated_gold?.normalized_value !== null) errors.push(`${label}: unresolved field must not invent a normalized value`);
  }
  const evidenceIds = new Set(fixture.gold_evidence.map((entry) => entry.evidence_id));
  for (const evidenceId of item.adjudicated_gold?.evidence_ids ?? []) {
    if (!evidenceIds.has(evidenceId)) errors.push(`${label}: adjudicated evidence ${evidenceId} is not retained by the frozen case`);
  }
}

export function validateAdjudicationPacket({ corpus, relations, manifest, decisions, validateSchema }) {
  const schemaValid = validateSchema(decisions);
  const schemaErrors = schemaValid ? [] : (validateSchema.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`);
  const structuralErrors = [];
  const semanticErrors = [];
  const expectedIds = corpus.cases.map((item) => item.case_id);
  const actualIds = decisions.cases?.map((item) => item.case_id) ?? [];
  if (decisions.schema_version !== ADJUDICATION_SCHEMA_VERSION) structuralErrors.push("schema version mismatch");
  if (decisions.source_fixture_version !== corpus.fixture_version) structuralErrors.push("source fixture version mismatch");
  if (decisions.source_case_manifest_hash !== manifest.selection_manifest_hash) structuralErrors.push("source manifest hash mismatch");
  if (actualIds.length !== expectedIds.length) structuralErrors.push(`expected ${expectedIds.length} decision cases, received ${actualIds.length}`);
  if (new Set(actualIds).size !== actualIds.length) structuralErrors.push("duplicate case ID");
  for (const id of actualIds) if (!expectedIds.includes(id)) structuralErrors.push(`unknown case ID: ${id}`);
  for (const id of expectedIds) if (!actualIds.includes(id)) structuralErrors.push(`missing case ID: ${id}`);

  const fixtureById = new Map(corpus.cases.map((item) => [item.case_id, item]));
  for (const caseDecision of decisions.cases ?? []) {
    const fixture = fixtureById.get(caseDecision.case_id);
    if (!fixture) continue;
    const expected = expectedCaseDecision(fixture, relations);
    if (caseDecision.source_capture_hash !== fixture.source_capture_hash) structuralErrors.push(`${fixture.case_id}: source capture hash mismatch`);
    const fieldNames = caseDecision.fields?.map((item) => item.field_name) ?? [];
    const expectedFieldNames = expected.fields.map((item) => item.field_name);
    if (new Set(fieldNames).size !== fieldNames.length) structuralErrors.push(`${fixture.case_id}: duplicate field decision`);
    for (const name of expectedFieldNames) if (!fieldNames.includes(name)) structuralErrors.push(`${fixture.case_id}: missing field ${name}`);
    for (const name of fieldNames) if (!expectedFieldNames.includes(name)) structuralErrors.push(`${fixture.case_id}: unknown field ${name}`);
    for (const item of caseDecision.fields ?? []) {
      const expectedField = expected.fields.find((candidate) => candidate.field_name === item.field_name);
      if (!expectedField) continue;
      const label = `${fixture.case_id}/${item.field_name}`;
      if (!deepEqual(item.candidate_gold, expectedField.candidate_gold) || item.candidate_gold_sha256 !== expectedField.candidate_gold_sha256) structuralErrors.push(`${label}: candidate snapshot differs from frozen corpus`);
      if (item.priority !== expectedField.priority) structuralErrors.push(`${label}: priority differs from policy`);
      validateFieldSemantics(item, fixture, semanticErrors, label);
    }
    const expectedPartials = expected.partial_decisions.map((item) => item.field_name);
    const actualPartials = caseDecision.partial_decisions?.map((item) => item.field_name) ?? [];
    if (!deepEqual(actualPartials, expectedPartials)) structuralErrors.push(`${fixture.case_id}: partial decision references differ from frozen corpus`);
    const expectedRelations = expected.relation_decisions.map((item) => item.relation_id);
    const actualRelations = caseDecision.relation_decisions?.map((item) => item.relation_id) ?? [];
    if (!deepEqual(actualRelations, expectedRelations)) structuralErrors.push(`${fixture.case_id}: relation decision references differ from frozen corpus`);
    for (const item of [...(caseDecision.partial_decisions ?? []), ...(caseDecision.relation_decisions ?? [])]) {
      const label = `${fixture.case_id}/${item.field_name ?? item.relation_id}`;
      if (["pending", "pending_independent_review", "not_reviewed"].includes(item.decision)) {
        if (item.reviewer_role !== null || item.reviewed_at !== null) semanticErrors.push(`${label}: pending item must not have reviewer metadata`);
      } else {
        reviewedMetadataValid(item, semanticErrors, label);
        if (["corrected", "unresolved", "not_adjudicable_with_current_evidence"].includes(item.decision) && !item.review_reason) semanticErrors.push(`${label}: ${item.decision} requires review_reason`);
        if (item.field_name && ["approved", "corrected"].includes(item.decision) && item.adjudicated_partial_gold === null) semanticErrors.push(`${label}: reviewed partial gold requires independent element-level targets`);
      }
    }
    if (caseDecision.decision === "pending_independent_review") {
      if (caseDecision.reviewer_role !== null || caseDecision.reviewed_at !== null) semanticErrors.push(`${fixture.case_id}: pending case must not have reviewer metadata`);
    } else if (caseDecision.decision === "in_review") {
      if (caseDecision.reviewer_role !== null && !ALLOWED_REVIEWER_ROLES.has(caseDecision.reviewer_role)) semanticErrors.push(`${fixture.case_id}: in-review role is not independent`);
    } else {
      reviewedMetadataValid(caseDecision, semanticErrors, fixture.case_id);
      if (["unresolved", "excluded_for_provenance_failure"].includes(caseDecision.decision) && !caseDecision.review_reason) semanticErrors.push(`${fixture.case_id}: ${caseDecision.decision} requires review_reason`);
      const childDecisions = [...caseDecision.fields, ...caseDecision.partial_decisions, ...caseDecision.relation_decisions].map((item) => item.decision);
      if (caseDecision.decision === "approved" && childDecisions.some((decision) => decision !== "approved")) semanticErrors.push(`${fixture.case_id}: approved case requires every review item to be approved`);
      if (caseDecision.decision === "corrected" && !childDecisions.includes("corrected")) semanticErrors.push(`${fixture.case_id}: corrected case requires at least one corrected review item`);
      if (caseDecision.decision === "unresolved" && !childDecisions.some((decision) => ["unresolved", "not_adjudicable_with_current_evidence"].includes(decision))) semanticErrors.push(`${fixture.case_id}: unresolved case requires at least one unresolved review item`);
    }
  }

  const allCasesTerminal = (decisions.cases ?? []).length === corpus.cases.length && decisions.cases.every((item) => TERMINAL_CASE_DECISIONS.has(item.decision));
  const allFieldsTerminal = (decisions.cases ?? []).every((item) => item.fields.every((field) => TERMINAL_FIELD_DECISIONS.has(field.decision)));
  const allP0Terminal = (decisions.cases ?? []).every((item) => item.fields.filter((field) => field.priority === "P0").every((field) => TERMINAL_FIELD_DECISIONS.has(field.decision)) && item.relation_decisions.every((relation) => TERMINAL_FIELD_DECISIONS.has(relation.decision)));
  const allPartialsTerminal = (decisions.cases ?? []).every((item) => item.partial_decisions.every((partial) => TERMINAL_PARTIAL_DECISIONS.has(partial.decision)));
  const packetComplete = structuralErrors.length === 0;
  const independentReviewComplete = schemaValid && packetComplete && semanticErrors.length === 0 && allCasesTerminal && allFieldsTerminal && allP0Terminal && allPartialsTerminal;
  return {
    schema_valid: schemaValid,
    packet_complete: packetComplete,
    independent_review_complete: independentReviewComplete,
    adjudicated_gold_ready: independentReviewComplete,
    schema_errors: schemaErrors,
    structural_errors: structuralErrors,
    semantic_errors: semanticErrors,
    completion_checks: { all_cases_terminal: allCasesTerminal, all_fields_terminal: allFieldsTerminal, all_p0_terminal: allP0Terminal, all_partials_terminal: allPartialsTerminal },
  };
}

export function buildRemediationCandidates(corpus, extractorByCase) {
  const phase3 = [];
  const phase4c = [];
  for (const fixture of corpus.cases) {
    if (fixture.parser_quality === "tool_unavailable") phase3.push({ case_id: fixture.case_id, field_name: "document_text", reason: `authoritative_${fixture.input_format}_parse_missing` });
    if (fixture.parser_quality === "ocr_not_evaluated") phase3.push({ case_id: fixture.case_id, field_name: "document_text", reason: "authoritative_ocr_missing" });
    if (fixture.source_status === "available_list_identity_only") phase3.push({ case_id: fixture.case_id, field_name: "document_text", reason: "authoritative_source_text_missing" });
    for (const reason of fixture.gold_review_reason_codes) {
      for (const fieldName of PHASE_4C_REASON_FIELDS[reason] ?? []) phase4c.push({ case_id: fixture.case_id, field_name: fieldName, reason });
    }
    const extracted = extractorByCase.get(fixture.case_id);
    if (extracted && extracted.classification.document_kind !== fixture.document_kind_gold) phase4c.push({ case_id: fixture.case_id, field_name: "document_kind", reason: "deterministic_classification_mismatch" });
  }
  const unique = (items) => [...new Map(items.map((item) => [`${item.case_id}/${item.field_name}/${item.reason}`, item])).values()];
  return { phase3: unique(phase3), phase4c: unique(phase4c) };
}

export function summarizeAdjudication(decisions, remediation, validation) {
  const cases = decisions.cases;
  const fields = cases.flatMap((item) => item.fields);
  const relations = cases.flatMap((item) => item.relation_decisions);
  const partials = cases.flatMap((item) => item.partial_decisions);
  const priorityItems = [...fields, ...relations, ...partials];
  const caseCount = (decision) => cases.filter((item) => item.decision === decision).length;
  const fieldCount = (decision) => fields.filter((item) => item.decision === decision).length;
  const pendingPriority = (priority) => priorityItems.filter((item) => item.priority === priority && ["pending", "pending_independent_review", "not_reviewed"].includes(item.decision)).length;
  return {
    phase: "ENGINE_PHASE_4",
    gate: "GATE_C",
    task: "independent-gold-adjudication-preparation",
    schema_version: decisions.schema_version,
    total_cases: cases.length,
    pending_cases: caseCount("pending_independent_review"),
    in_review_cases: caseCount("in_review"),
    approved_cases: caseCount("approved"),
    corrected_cases: caseCount("corrected"),
    unresolved_cases: caseCount("unresolved"),
    excluded_cases: caseCount("excluded_for_provenance_failure"),
    reviewed_case_count: cases.filter((item) => TERMINAL_CASE_DECISIONS.has(item.decision)).length,
    total_fields: fields.length,
    pending_fields: fields.filter((item) => ["pending", "not_reviewed"].includes(item.decision)).length,
    approved_fields: fieldCount("approved"),
    corrected_fields: fieldCount("corrected"),
    unresolved_fields: fieldCount("unresolved"),
    total_relation_items: relations.length,
    pending_relation_items: relations.filter((item) => ["pending", "not_reviewed"].includes(item.decision)).length,
    total_partial_items: partials.length,
    p0_pending: pendingPriority("P0"),
    p1_pending: pendingPriority("P1"),
    p2_pending: pendingPriority("P2"),
    phase_3_remediation_candidates: remediation.phase3,
    phase_4c_semantic_candidates: remediation.phase4c,
    partial_gold_pending: partials.filter((item) => item.decision === "pending_independent_review").length,
    schema_valid: validation.schema_valid,
    packet_complete: validation.packet_complete,
    independent_review_complete: validation.independent_review_complete,
    adjudicated_gold_ready: validation.adjudicated_gold_ready,
    phase5_ready: false,
    production_ready: false,
  };
}
