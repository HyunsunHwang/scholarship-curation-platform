import { analysisSha256, stableAnalysisUuid } from "./analysis-identifiers.mjs";
import { validateAnalysisSchema } from "./analysis-validator.mjs";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeProgramName(value) {
  return clean(value).toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu, "");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function fingerprint(value) {
  return analysisSha256(JSON.stringify(stable(value)));
}

function operatorName(output) {
  return clean(output.organizations?.find((row) => row.role === "operator")?.name);
}

function funderName(output) {
  return clean(output.organizations?.find((row) => row.role === "funder")?.name);
}

export function validateApprovedSemanticReview({ review, result }) {
  const errors = [];
  if (review?.decision !== "approve") errors.push("analysis_review_not_approved");
  if (!result || result.result_status !== "validated") errors.push("analysis_result_not_validated");
  if (
    review?.result_id !== result?.id
    || review?.notice_id !== result?.notice_id
    || review?.revision_id !== result?.revision_id
  ) {
    errors.push("analysis_review_lineage_mismatch");
  }
  const effectiveOutput = review?.effective_output ?? null;
  const schema = validateAnalysisSchema(effectiveOutput);
  if (!schema.valid) errors.push("effective_output_schema_invalid");
  if (
    effectiveOutput?.lineage?.notice_id !== result?.notice_id
    || effectiveOutput?.lineage?.revision_id !== result?.revision_id
  ) {
    errors.push("effective_output_lineage_mismatch");
  }
  return { valid: errors.length === 0, errors, effective_output: effectiveOutput };
}

export function findExistingProgramCandidates({
  programName,
  operatingOrganization,
  programs = [],
  aliases = [],
}) {
  const normalizedName = normalizeProgramName(programName);
  const normalizedOrganization = normalizeProgramName(operatingOrganization);
  const aliasProgramIds = new Set(
    aliases
      .filter((alias) => alias.normalized_alias === normalizedName)
      .map((alias) => alias.program_id),
  );
  const exact = [];
  const review = [];
  for (const program of programs) {
    const nameMatch = normalizeProgramName(program.canonical_name) === normalizedName
      || aliasProgramIds.has(program.id);
    if (!nameMatch) continue;
    const organizationMatch = normalizeProgramName(program.operating_organization)
      === normalizedOrganization;
    const candidate = {
      program_id: program.id,
      canonical_name: program.canonical_name,
      operating_organization: program.operating_organization,
      match_kind: organizationMatch ? "exact_name_and_organization" : "name_only_review",
    };
    if (organizationMatch) exact.push(candidate);
    else review.push(candidate);
  }
  return {
    exact_matches: exact,
    review_candidates: review,
    suggested_program_id: exact.length === 1 ? exact[0].program_id : null,
  };
}

export function buildProgramCycleProposal({
  review,
  result,
  evidence = [],
  notice = null,
  source = null,
  programs = [],
  aliases = [],
  cycles = [],
  now = new Date().toISOString(),
}) {
  const eligibility = validateApprovedSemanticReview({ review, result });
  if (!eligibility.valid) {
    return { eligible: false, errors: eligibility.errors, proposal: null };
  }
  const output = eligibility.effective_output;
  const programName = clean(output.program?.name);
  const cycleLabel = clean(output.cycle?.name);
  if (!programName || !cycleLabel) {
    return {
      eligible: false,
      errors: [
        ...(!programName ? ["program_name_missing"] : []),
        ...(!cycleLabel ? ["cycle_label_missing"] : []),
      ],
      proposal: null,
    };
  }
  const operatingOrganization = operatorName(output);
  const match = findExistingProgramCandidates({
    programName,
    operatingOrganization,
    programs,
    aliases,
  });
  const startDate = output.application?.start_date?.value ?? null;
  const cycleYear = Number(cycleLabel.match(/(?:19|20)\d{2}/)?.[0] ?? startDate?.slice(0, 4)) || null;
  const proposedProgram = {
    canonical_name: programName,
    normalized_name: normalizeProgramName(programName),
    operating_organization: operatingOrganization || null,
    funding_organization: funderName(output) || null,
    description: null,
  };
  const proposedCycle = {
    cycle_label: cycleLabel,
    cycle_year: cycleYear,
    academic_term: cycleLabel.match(/[12]\s*학기/u)?.[0]?.replace(/\s+/g, "") ?? null,
    application_start_at: startDate,
    application_end_at: output.application?.end_date?.value ?? null,
    benefits: output.benefits ?? [],
    eligibility: output.eligibility_conditions ?? [],
    target_scope: output.target_scope ?? null,
    required_documents: output.required_documents ?? [],
    application_method: output.application?.method ?? null,
    application_url: output.application?.url_or_path ?? null,
    source_detail_url: notice?.canonical_url ?? null,
  };
  const programCycles = match.suggested_program_id
    ? cycles.filter((row) => row.program_id === match.suggested_program_id)
    : [];
  const exactCycle = programCycles.find((row) => row.source_revision_id === result.revision_id);
  const cycleReviewCandidates = programCycles
    .filter((row) => !exactCycle && clean(row.cycle_label) === cycleLabel)
    .map((row) => ({
      cycle_id: row.id,
      cycle_label: row.cycle_label,
      match_kind: "same_label_review",
    }));
  const sourceSnapshot = {
    source_id: source?.source_id ?? notice?.source_id ?? null,
    source_name: source?.source_name ?? null,
  };
  const duplicateCandidates = {
    programs: match.review_candidates,
    cycles: cycleReviewCandidates,
  };
  const fingerprintInput = {
    analysis_review_event_id: review.id,
    analysis_result_id: result.id,
    notice_id: result.notice_id,
    revision_id: result.revision_id,
    proposed_program: proposedProgram,
    proposed_cycle: proposedCycle,
    suggested_program_id: match.suggested_program_id,
    suggested_cycle_id: exactCycle?.id ?? null,
    duplicate_candidates: duplicateCandidates,
    source_snapshot: sourceSnapshot,
  };
  const proposalFingerprint = fingerprint(fingerprintInput);
  return {
    eligible: true,
    errors: [],
    proposal: {
      id: stableAnalysisUuid("scholarship_program_cycle_proposals", proposalFingerprint),
      analysis_result_id: result.id,
      analysis_review_event_id: review.id,
      notice_id: result.notice_id,
      revision_id: result.revision_id,
      proposed_program: proposedProgram,
      proposed_cycle: proposedCycle,
      suggested_existing_program_id: match.suggested_program_id,
      suggested_existing_cycle_id: exactCycle?.id ?? null,
      source_snapshot: sourceSnapshot,
      duplicate_candidates: duplicateCandidates,
      evidence_snapshot: evidence
        .filter((row) => row.result_id === result.id)
        .sort((a, b) => `${a.field_path}|${a.evidence_fingerprint}`
          .localeCompare(`${b.field_path}|${b.evidence_fingerprint}`)),
      confidence: {
        program: output.program.confidence,
        cycle: output.cycle.confidence,
      },
      proposal_fingerprint: proposalFingerprint,
      status: "pending",
      created_at: now,
      updated_at: now,
    },
  };
}

function cloneState(state = {}) {
  return {
    programs: structuredClone(state.programs ?? []),
    aliases: structuredClone(state.aliases ?? []),
    cycles: structuredClone(state.cycles ?? []),
    proposals: structuredClone(state.proposals ?? []),
    review_events: structuredClone(state.review_events ?? []),
    scholarships: structuredClone(state.scholarships ?? []),
    projection_links: structuredClone(state.projection_links ?? []),
  };
}

export function approveProgramCycleProposal({
  state,
  proposalId,
  decision,
  actorId,
  existingProgramId = null,
  existingCycleId = null,
  programPatch = {},
  cyclePatch = {},
  idempotencyKey,
  isAdmin,
  now = new Date().toISOString(),
}) {
  const next = cloneState(state);
  if (!isAdmin) return { ok: false, reason: "admin_required", state: next };
  const replay = next.review_events.find((row) => row.event_idempotency_key === idempotencyKey);
  if (replay) return { ok: true, replayed: true, event: replay, state: next };
  const proposal = next.proposals.find((row) => row.id === proposalId);
  if (!proposal) return { ok: false, reason: "proposal_not_found", state: next };
  if (proposal.status !== "pending") {
    return { ok: false, reason: "proposal_not_pending", state: next };
  }
  const allowed = [
    "approve_new_program_and_cycle",
    "approve_existing_program_new_cycle",
    "approve_existing_program_existing_cycle",
    "needs_revision",
    "reject",
  ];
  if (!allowed.includes(decision)) return { ok: false, reason: "invalid_decision", state: next };
  if (["needs_revision", "reject"].includes(decision)) {
    proposal.status = decision;
    const event = {
      id: stableAnalysisUuid("scholarship_proposal_review_events", idempotencyKey),
      proposal_id: proposal.id,
      decision,
      actor_id: actorId,
      program_id: null,
      cycle_id: null,
      event_idempotency_key: idempotencyKey,
      created_at: now,
    };
    next.review_events.push(event);
    return { ok: true, replayed: false, event, state: next };
  }

  let program;
  if (decision === "approve_new_program_and_cycle") {
    const programId = stableAnalysisUuid("scholarship_programs", `${proposal.id}|new-program`);
    program = {
      id: programId,
      ...proposal.proposed_program,
      ...programPatch,
      normalized_name: normalizeProgramName(
        programPatch.canonical_name ?? proposal.proposed_program.canonical_name,
      ),
      status: "active",
      created_from_proposal_id: proposal.id,
      created_by: actorId,
      created_at: now,
      updated_at: now,
    };
    next.programs.push(program);
    next.aliases.push({
      id: stableAnalysisUuid("scholarship_program_aliases", `${programId}|canonical`),
      program_id: programId,
      alias: program.canonical_name,
      normalized_alias: program.normalized_name,
      alias_kind: "canonical",
      source_proposal_id: proposal.id,
      created_at: now,
    });
  } else {
    program = next.programs.find((row) => row.id === existingProgramId);
    if (!program) return { ok: false, reason: "target_program_not_found", state: cloneState(state) };
  }

  let cycle;
  if (decision === "approve_existing_program_existing_cycle") {
    cycle = next.cycles.find((row) => row.id === existingCycleId && row.program_id === program.id);
    if (!cycle) return { ok: false, reason: "target_cycle_not_found", state: cloneState(state) };
  } else {
    const logicalKey = fingerprint({
      program_id: program.id,
      revision_id: proposal.revision_id,
      cycle_label: cyclePatch.cycle_label ?? proposal.proposed_cycle.cycle_label,
    });
    cycle = next.cycles.find((row) => row.idempotency_key === logicalKey);
    if (!cycle) {
      cycle = {
        id: stableAnalysisUuid("scholarship_cycles", logicalKey),
        program_id: program.id,
        ...proposal.proposed_cycle,
        ...cyclePatch,
        source_notice_id: proposal.notice_id,
        source_revision_id: proposal.revision_id,
        canonical_status: "approved",
        publication_status: "review_safe",
        idempotency_key: logicalKey,
        created_from_proposal_id: proposal.id,
        created_by: actorId,
        created_at: now,
        updated_at: now,
      };
      next.cycles.push(cycle);
    }
  }
  proposal.status = "approved";
  proposal.canonical_program_id = program.id;
  proposal.canonical_cycle_id = cycle.id;
  const event = {
    id: stableAnalysisUuid("scholarship_proposal_review_events", idempotencyKey),
    proposal_id: proposal.id,
    decision,
    actor_id: actorId,
    program_id: program.id,
    cycle_id: cycle.id,
    event_idempotency_key: idempotencyKey,
    created_at: now,
  };
  next.review_events.push(event);
  return { ok: true, replayed: false, program, cycle, event, state: next };
}

export function projectCycleToScholarship({
  state,
  cycleId,
  allowProjection,
  now = new Date().toISOString(),
}) {
  const next = cloneState(state);
  if (!allowProjection) return { ok: false, reason: "explicit_projection_required", state: next };
  const existingLink = next.projection_links.find((row) => row.cycle_id === cycleId);
  if (existingLink) return { ok: true, replayed: true, link: existingLink, state: next };
  const cycle = next.cycles.find((row) => row.id === cycleId);
  if (!cycle || cycle.canonical_status !== "approved") {
    return { ok: false, reason: "approved_cycle_required", state: next };
  }
  const program = next.programs.find((row) => row.id === cycle.program_id);
  if (!program) return { ok: false, reason: "program_not_found", state: next };
  const manualCollision = next.scholarships.find((row) =>
    row.source_kind !== "canonical_projection"
    && row.apply_url === cycle.application_url
    && row.name === program.canonical_name);
  if (manualCollision) {
    return { ok: false, reason: "manual_scholarship_collision", state: next };
  }
  if (!cycle.application_start_at || !cycle.application_end_at || !cycle.application_url) {
    return { ok: false, reason: "projection_required_fields_missing", state: next };
  }
  const scholarshipId = Math.max(0, ...next.scholarships.map((row) => Number(row.id) || 0)) + 1;
  const scholarship = {
    id: scholarshipId,
    name: program.canonical_name,
    organization: program.operating_organization ?? program.funding_organization ?? "미상",
    scholarship_type: "on_campus",
    institution_type: "기타",
    support_types: [...new Set(cycle.benefits.map((row) => ({
      tuition: "등록금",
      cash: "생활비",
      living_expense: "생활비",
      activity: "학업장려금",
      in_kind: "기타",
      other: "기타",
    })[row.type]).filter(Boolean))],
    support_amount_text: cycle.benefits.map((row) => row.amount_text).filter(Boolean).join(", ") || null,
    apply_start_date: cycle.application_start_at,
    apply_end_date: cycle.application_end_at,
    qual_university: cycle.target_scope?.universities ?? null,
    qual_major: cycle.target_scope?.majors ?? null,
    qual_academic_year: null,
    qual_enrollment_status: cycle.target_scope?.enrollment_statuses ?? null,
    qual_extra_requirements: cycle.eligibility,
    required_documents: cycle.required_documents,
    apply_method: cycle.application_method ?? "",
    apply_url: cycle.application_url,
    homepage_url: cycle.source_detail_url ?? cycle.application_url,
    original_notice_text: null,
    is_verified: false,
    list_on_home: false,
    source_kind: "canonical_projection",
    created_at: now,
    updated_at: now,
  };
  next.scholarships.push(scholarship);
  const link = {
    id: stableAnalysisUuid("scholarship_projection_links", cycle.id),
    cycle_id: cycle.id,
    scholarship_id: scholarship.id,
    projection_status: "review_safe",
    created_at: now,
    updated_at: now,
  };
  next.projection_links.push(link);
  return { ok: true, replayed: false, scholarship, link, state: next };
}
