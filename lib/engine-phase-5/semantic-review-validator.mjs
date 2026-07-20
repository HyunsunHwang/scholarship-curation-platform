import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/engine/phase-5-semantic-review-proposal.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("uri", { type: "string", validate: (value) => {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
} });
const validateSchema = ajv.compile(schema);
const TERMINAL_KINDS = new Set(["result_announcement", "general_guidance", "information_session"]);

function supportedByText(value, refs, evidenceById) {
  if (typeof value !== "string" || !value.trim()) return false;
  const needle = value.replace(/[\s,]/g, "").toLowerCase();
  return refs.some((ref) => evidenceById.get(ref)?.replace(/[\s,]/g, "").toLowerCase().includes(needle));
}

export function validateSemanticReviewProposal({ proposal, record, inputRecordHash }) {
  const schemaValid = validateSchema(proposal);
  const errors = schemaValid ? [] : (validateSchema.errors ?? []).map((error) => `schema:${error.instancePath || "/"}:${error.keyword}`);
  const evidenceById = new Map(record.evidence.map((item) => [item.evidence_id, item.normalized_text]));
  if (proposal.case_id !== undefined && !proposal.case_id.trim()) errors.push("case_identity_missing");
  if (proposal.source_notice_identity?.notice_id !== record.source_notice_identity.notice_id) errors.push("source_identity_mismatch");
  if (inputRecordHash && proposal.input_record_hash !== inputRecordHash) errors.push("input_record_hash_mismatch");
  const allRefs = [];
  const collect = (items) => items.forEach((item) => allRefs.push(...(item.evidence_refs ?? [])));
  collect(proposal.organization_role_assertions ?? []);
  collect(proposal.benefit_components ?? []);
  collect(proposal.program_candidates ?? []);
  collect(proposal.cycle_candidates ?? []);
  collect(proposal.relation_proposals ?? []);
  collect(proposal.canonical_projection ?? []);
  collect(proposal.uncertainties ?? []);
  const danglingEvidenceRefs = [...new Set(allRefs.filter((ref) => !evidenceById.has(ref)))].sort();
  if (danglingEvidenceRefs.length > 0) errors.push("dangling_evidence_reference");

  for (const assertion of proposal.organization_role_assertions ?? []) {
    if (!supportedByText(assertion.organization_name, assertion.evidence_refs, evidenceById)) errors.push(`unsupported_organization:${assertion.assertion_id}`);
  }
  for (const component of proposal.benefit_components ?? []) {
    if (!supportedByText(component.raw_text, component.evidence_refs, evidenceById)) errors.push(`unsupported_amount:${component.component_id}`);
    if (component.component_kind === "amount_range" && (component.minimum === null || component.maximum === null || component.minimum > component.maximum)) {
      errors.push(`invalid_amount_range:${component.component_id}`);
    }
    if (["fixed_amount", "periodic_payment", "hourly_payment"].includes(component.component_kind) && component.amount === null) {
      errors.push(`missing_component_amount:${component.component_id}`);
    }
    if (component.component_kind === "hourly_payment" && component.period !== "hour") errors.push(`invalid_hour_period:${component.component_id}`);
  }

  const organizationIds = new Set((proposal.organization_role_assertions ?? []).map((item) => item.assertion_id));
  const benefitIds = new Set((proposal.benefit_components ?? []).map((item) => item.component_id));
  const programIds = new Set((proposal.program_candidates ?? []).map((item) => item.proposal_id));
  for (const program of proposal.program_candidates ?? []) {
    if (!supportedByText(program.proposed_name, program.evidence_refs, evidenceById)) errors.push(`unsupported_program_name:${program.proposal_id}`);
    if (program.organization_assertion_refs.length === 0) errors.push(`program_organization_missing:${program.proposal_id}`);
    if (program.organization_assertion_refs.some((ref) => !organizationIds.has(ref))) errors.push(`dangling_organization_assertion:${program.proposal_id}`);
    if (program.benefit_component_refs.some((ref) => !benefitIds.has(ref))) errors.push(`dangling_benefit_component:${program.proposal_id}`);
  }
  for (const cycle of proposal.cycle_candidates ?? []) {
    if (!programIds.has(cycle.program_proposal_ref)) errors.push(`cycle_program_missing:${cycle.proposal_id}`);
    const boundaries = [cycle.cycle_label, cycle.academic_year, cycle.term, cycle.round, cycle.application_window]
      .filter((value) => value !== null).map(String);
    if (boundaries.length === 0) errors.push(`cycle_boundary_missing:${cycle.proposal_id}`);
    else if (!boundaries.some((value) => supportedByText(value, cycle.evidence_refs, evidenceById))) errors.push(`unsupported_cycle_boundary:${cycle.proposal_id}`);
  }
  for (const relation of proposal.relation_proposals ?? []) {
    const subject = relation.subject_identity;
    const object = relation.object_identity;
    if (![subject?.notice_id, subject?.canonical_url, subject?.unresolved_label].some(Boolean)
      || ![object?.notice_id, object?.canonical_url, object?.unresolved_label].some(Boolean)) errors.push(`relation_identity_missing:${relation.proposal_id}`);
    if (relation.review_required !== true || relation.automatic_resolution_allowed !== false) errors.push(`relation_auto_resolution:${relation.proposal_id}`);
  }
  if (TERMINAL_KINDS.has(record.classification.document_kind) && (proposal.program_candidates?.length > 0 || proposal.cycle_candidates?.length > 0)) {
    errors.push("terminal_recruitment_promotion");
  }
  if (record.classification.document_kind === "correction_notice" && (proposal.program_candidates?.length > 0 || proposal.cycle_candidates?.length > 0)) {
    errors.push("correction_standalone_identity");
  }
  if (proposal.review?.automatic_identity_resolution_allowed !== false) errors.push("automatic_identity_resolution_enabled");
  const uniqueErrors = [...new Set(errors)].sort();
  const accepted = uniqueErrors.length === 0;
  const validatedProposal = structuredClone(proposal);
  validatedProposal.review.required = true;
  validatedProposal.review.automatic_identity_resolution_allowed = false;
  validatedProposal.review.automatic_publish_allowed = false;
  validatedProposal.review.notification_allowed = false;
  if (!accepted) {
    validatedProposal.review.proposal_status = "rejected_by_validator";
    validatedProposal.review.reason_codes = [...new Set([...validatedProposal.review.reason_codes, "deterministic_validator_rejection"])].sort();
  }
  return {
    schema_valid: schemaValid,
    semantic_valid: accepted,
    evidence_reference_valid: danglingEvidenceRefs.length === 0,
    dangling_evidence_refs: danglingEvidenceRefs,
    errors: uniqueErrors,
    proposal: validatedProposal,
  };
}
