import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const PHASE_4_SCHEMA_VERSION = "engine-phase-4-canonical-scholarship/v1";
export const PHASE_4_EVALUATION_VERSION = "engine-phase-4-evaluation-cases/v1";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(moduleDirectory, "../..");

export const contractPaths = {
  canonicalSchema: path.join(repositoryRoot, "schemas/engine/phase-4-canonical-scholarship.schema.json"),
  evidenceSchema: path.join(repositoryRoot, "schemas/engine/phase-4-evidence.schema.json"),
  evaluationSchema: path.join(repositoryRoot, "schemas/engine/phase-4-evaluation-case.schema.json"),
  validRecord: path.join(repositoryRoot, "fixtures/engine-phase-4-contract/valid-canonical-record.json"),
  evaluationCases: path.join(repositoryRoot, "fixtures/engine-phase-4-contract/evaluation-cases.json"),
};

export const REQUIRED_METRICS = [
  "document_classification_accuracy",
  "field_presence_precision",
  "field_presence_recall",
  "normalized_exact_match",
  "normalized_partial_match",
  "evidence_attribution_accuracy",
  "unsupported_value_rate",
  "identity_candidate_pair_precision",
  "identity_candidate_pair_recall",
  "material_change_classification_accuracy",
  "review_required_recall",
];

export const REQUIRED_SCENARIOS = [
  "normal_html",
  "pdf_primary",
  "table_primary",
  "attachment_only",
  "multiple_dates",
  "deadline_extension",
  "new_term",
  "result_announcement",
  "school_recommendation",
  "reposted_notice",
  "complex_eligibility",
  "amount_range_or_tuition",
  "missing_value",
  "conflicting_sources",
  "low_quality_ocr",
];

export const REQUIRED_THRESHOLD_STAGES = [
  "contract_validator_threshold",
  "prototype_evaluation_threshold",
  "production_candidate_threshold",
  "notification_safe_threshold",
];

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function createSchemaValidators() {
  const evidenceSchema = readJson(contractPaths.evidenceSchema);
  const canonicalSchema = readJson(contractPaths.canonicalSchema);
  const evaluationSchema = readJson(contractPaths.evaluationSchema);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
  });
  ajv.addSchema(evidenceSchema);
  ajv.addSchema(canonicalSchema);
  ajv.addSchema(evaluationSchema);
  return {
    ajv,
    canonical: ajv.getSchema(canonicalSchema.$id),
    evidence: ajv.getSchema(evidenceSchema.$id),
    evaluation: ajv.getSchema(evaluationSchema.$id),
    schemas: { canonicalSchema, evidenceSchema, evaluationSchema },
  };
}

function error(code, pathValue, detail = null) {
  return { code, path: pathValue, detail };
}

function collectEvidenceRefs(value, currentPath = "$", output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectEvidenceRefs(entry, `${currentPath}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "evidence_refs" && Array.isArray(entry)) {
      entry.forEach((reference) => output.push({ reference, path: `${currentPath}.${key}` }));
    } else if (key !== "evidence") {
      collectEvidenceRefs(entry, `${currentPath}.${key}`, output);
    }
  }
  return output;
}

function schemaErrors(validator) {
  return (validator.errors ?? []).map((entry) =>
    error("schema_invalid", entry.instancePath || "$", `${entry.keyword}: ${entry.message}`),
  );
}

const DOCUMENT_EVIDENCE_TYPES = new Set([
  "pdf_text", "pdf_table_cell", "hwp_text", "hwpx_text", "ocr_text",
]);
const HTML_EVIDENCE_TYPES = new Set([
  "html_text", "html_attribute", "html_table_cell", "url_metadata",
]);
const TEXT_EVIDENCE_TYPES = new Set([
  "html_text", "html_attribute", "html_table_cell", "pdf_text", "pdf_table_cell",
  "hwp_text", "hwpx_text", "ocr_text",
]);
const TABLE_EVIDENCE_TYPES = new Set(["html_table_cell", "pdf_table_cell"]);

function hasNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasEvidenceRefs(value) {
  return Array.isArray(value) && value.length > 0;
}

export function validateCanonicalRecord(record, validators = createSchemaValidators()) {
  const errors = [];
  if (!validators.canonical(record)) errors.push(...schemaErrors(validators.canonical));

  const evidence = Array.isArray(record?.evidence) ? record.evidence : [];
  const evidenceIds = evidence.map((entry) => entry?.evidence_id).filter(Boolean);
  const evidenceIdSet = new Set(evidenceIds);
  if (evidenceIdSet.size !== evidenceIds.length) {
    errors.push(error("duplicate_evidence_id", "$.evidence"));
  }
  for (const reference of collectEvidenceRefs(record)) {
    if (!evidenceIdSet.has(reference.reference)) {
      errors.push(error("missing_evidence_ref", reference.path, reference.reference));
    }
  }

  for (const [fieldName, field] of Object.entries(record?.fields ?? {})) {
    const fieldPath = `$.fields.${fieldName}`;
    if (field?.value_status === "present") {
      if (field.normalized_value === null || field.normalized_value === undefined) {
        errors.push(error("present_value_missing", `${fieldPath}.normalized_value`));
      }
      if (!Array.isArray(field.evidence_refs) || field.evidence_refs.length === 0) {
        errors.push(error("missing_evidence", `${fieldPath}.evidence_refs`));
      }
      if (field.inference?.is_inferred && !String(field.inference?.reason ?? "").trim()) {
        errors.push(error("unsupported_invented_value", `${fieldPath}.inference.reason`));
      }
    }
    if (["not_found", "unknown", "not_applicable"].includes(field?.value_status) && field.normalized_value !== null) {
      errors.push(error("non_present_status_has_value", `${fieldPath}.normalized_value`, field.value_status));
    }
    const date = field?.normalized_value;
    if (date?.kind === "exact_date" && !hasNonEmptyText(date.date)) {
      errors.push(error("exact_date_value_missing", `${fieldPath}.normalized_value.date`));
    }
    if (date?.kind === "exact_datetime" && !hasNonEmptyText(date.datetime)) {
      errors.push(error("exact_datetime_value_missing", `${fieldPath}.normalized_value.datetime`));
    }
    if (date?.kind === "date_range" && !hasNonEmptyText(date.start)) {
      errors.push(error("date_range_boundary_missing", `${fieldPath}.normalized_value.start`));
    }
    if (date?.kind === "date_range" && !hasNonEmptyText(date.end)) {
      errors.push(error("date_range_boundary_missing", `${fieldPath}.normalized_value.end`));
    }
    if (date?.kind === "open_ended" && !hasNonEmptyText(date.start) && !hasNonEmptyText(date.relative_text)) {
      errors.push(error("open_ended_value_missing", `${fieldPath}.normalized_value`));
    }
    if (date?.kind === "recurring" && !hasNonEmptyText(date.recurrence)) {
      errors.push(error("recurrence_value_missing", `${fieldPath}.normalized_value.recurrence`));
    }
    if (date?.kind === "relative_text_only" && !hasNonEmptyText(date.relative_text)) {
      errors.push(error("relative_date_text_missing", `${fieldPath}.normalized_value.relative_text`));
    }
    if (date?.kind === "date_range" && date.start && date.end && Date.parse(date.start) > Date.parse(date.end)) {
      errors.push(error("invalid_date_range", `${fieldPath}.normalized_value`));
    }
    const amount = fieldName === "amount" ? field?.normalized_value : null;
    if (amount?.kind === "exact" && !Number.isFinite(amount.amount)) {
      errors.push(error("exact_amount_value_missing", `${fieldPath}.normalized_value.amount`));
    }
    if (amount?.kind === "range" && !Number.isFinite(amount.minimum)) {
      errors.push(error("amount_range_boundary_missing", `${fieldPath}.normalized_value.minimum`));
    }
    if (amount?.kind === "range" && !Number.isFinite(amount.maximum)) {
      errors.push(error("amount_range_boundary_missing", `${fieldPath}.normalized_value.maximum`));
    }
    if (amount?.kind === "range" && Number.isFinite(amount.minimum) && Number.isFinite(amount.maximum) && amount.minimum > amount.maximum) {
      errors.push(error("invalid_amount_range", `${fieldPath}.normalized_value`));
    }
    if (["tuition_waiver", "partial_tuition", "non_cash"].includes(amount?.kind) && !hasNonEmptyText(amount.description)) {
      errors.push(error(amount.kind === "non_cash" ? "non_cash_description_missing" : "amount_description_missing", `${fieldPath}.normalized_value.description`));
    }
  }

  const documents = new Map((record?.source_documents ?? []).map((document) => [document.document_revision_id, document]));
  for (const item of evidence) {
    const evidencePath = `$.evidence.${item?.evidence_id ?? "unknown"}`;
    if (HTML_EVIDENCE_TYPES.has(item?.source_type) && !hasNonEmptyText(item.source_notice_id)) {
      errors.push(error("evidence_source_notice_missing", `${evidencePath}.source_notice_id`));
    }
    if (DOCUMENT_EVIDENCE_TYPES.has(item?.source_type)) {
      if (!hasNonEmptyText(item.document_id) || !hasNonEmptyText(item.document_revision_id)) {
        errors.push(error("evidence_document_identity_missing", evidencePath));
      }
      if (!hasNonEmptyText(item.document_hash)) {
        errors.push(error("evidence_document_hash_missing", `${evidencePath}.document_hash`));
      }
      if (!item.locator || typeof item.locator !== "object") {
        errors.push(error("evidence_locator_missing", `${evidencePath}.locator`));
      }
      if (hasNonEmptyText(item.document_revision_id)) {
        const document = documents.get(item.document_revision_id);
        if (!document) {
          errors.push(error("evidence_document_missing", evidencePath, item.document_revision_id));
        } else if (item.document_hash !== document.document_hash) {
          errors.push(error("evidence_document_hash_mismatch", `${evidencePath}.document_hash`));
        }
      }
    }
    if (TEXT_EVIDENCE_TYPES.has(item?.source_type) && !hasNonEmptyText(item.raw_text) && !hasNonEmptyText(item.normalized_text)) {
      errors.push(error("evidence_text_missing", evidencePath));
    }
    if (TABLE_EVIDENCE_TYPES.has(item?.source_type) && (!item.locator?.table_coordinates || typeof item.locator.table_coordinates !== "object")) {
      errors.push(error("evidence_table_coordinates_missing", `${evidencePath}.locator.table_coordinates`));
    }
    if (item?.source_type === "ocr_text" && (!Number.isInteger(item.locator?.page_number) || !item.locator?.bounding_box)) {
      errors.push(error("evidence_ocr_locator_missing", `${evidencePath}.locator`));
    }
    if (item?.source_type === "manual_annotation") {
      if (!hasNonEmptyText(item.manual_annotation_id)) {
        errors.push(error("manual_annotation_identity_missing", `${evidencePath}.manual_annotation_id`));
      }
      if (!hasNonEmptyText(item.inference_reason)) {
        errors.push(error("manual_annotation_reason_missing", `${evidencePath}.inference_reason`));
      }
    }
    if (["attachment_metadata", "url_metadata"].includes(item?.source_type)
      && !hasNonEmptyText(item.raw_text)
      && !hasNonEmptyText(item.normalized_text)
      && !(item.metadata && typeof item.metadata === "object" && Object.keys(item.metadata).length > 0)
      && !hasNonEmptyText(item.attachment_url)) {
      errors.push(error("evidence_metadata_missing", evidencePath));
    }
    const span = item.locator?.text_span;
    if (span && span.start >= span.end) {
      errors.push(error("invalid_text_span", `${evidencePath}.locator.text_span`));
    }
    if (item.extractor?.kind === "model" && !String(item.inference_reason ?? "").trim()) {
      errors.push(error("model_inference_reason_missing", `${evidencePath}.inference_reason`));
    }
  }

  const programId = record?.program_identity_candidate?.candidate_id;
  const cycle = record?.recruitment_cycle_identity_candidate;
  const revision = record?.opportunity_revision;
  const noticeId = record?.source_notice_identity?.notice_id;
  if (!hasEvidenceRefs(record?.classification?.evidence_refs)) {
    errors.push(error("classification_evidence_missing", "$.classification.evidence_refs"));
  }
  if (record?.program_identity_candidate?.resolution_status === "proposed"
    && !hasEvidenceRefs(record.program_identity_candidate.evidence_refs)) {
    errors.push(error("program_candidate_evidence_missing", "$.program_identity_candidate.evidence_refs"));
  }
  if (cycle?.resolution_status === "proposed" && !hasEvidenceRefs(cycle.evidence_refs)) {
    errors.push(error("cycle_candidate_evidence_missing", "$.recruitment_cycle_identity_candidate.evidence_refs"));
  }
  for (const [index, change] of (record?.material_changes ?? []).entries()) {
    if (!hasEvidenceRefs(change.evidence_refs)) {
      errors.push(error("material_change_evidence_missing", `$.material_changes[${index}].evidence_refs`));
    }
  }
  const unresolvedCandidateExists = [record?.program_identity_candidate, cycle]
    .some((candidate) => candidate?.resolution_status === "unresolved");
  if (unresolvedCandidateExists && record?.review?.required !== true) {
    errors.push(error("unresolved_identity_review_missing", "$.review.required"));
  }
  if (programId && cycle?.program_candidate_id !== programId) {
    errors.push(error("identity_hierarchy_contradiction", "$.recruitment_cycle_identity_candidate.program_candidate_id"));
  }
  if (cycle?.candidate_id && revision?.cycle_candidate_id !== cycle.candidate_id) {
    errors.push(error("identity_hierarchy_contradiction", "$.opportunity_revision.cycle_candidate_id"));
  }
  if (noticeId && revision?.source_notice_id !== noticeId) {
    errors.push(error("identity_hierarchy_contradiction", "$.opportunity_revision.source_notice_id"));
  }
  for (const documentRevisionId of revision?.source_document_revision_ids ?? []) {
    if (!documents.has(documentRevisionId)) {
      errors.push(error("identity_hierarchy_contradiction", "$.opportunity_revision.source_document_revision_ids", documentRevisionId));
    }
  }
  if (record?.classification?.document_kind === "result_announcement" && record?.classification?.is_recruitment) {
    errors.push(error("classification_contradiction", "$.classification.is_recruitment"));
  }
  return { valid: errors.length === 0, errors };
}

export function validateEvaluationManifest(manifest, validators = createSchemaValidators()) {
  const errors = [];
  if (!validators.evaluation(manifest)) errors.push(...schemaErrors(validators.evaluation));
  const caseIds = (manifest?.cases ?? []).map((entry) => entry.case_id);
  if (new Set(caseIds).size !== caseIds.length) errors.push(error("duplicate_case_id", "$.cases"));
  const metrics = new Set(manifest?.metrics ?? []);
  const scenarios = new Set((manifest?.cases ?? []).map((entry) => entry.scenario));
  const stages = new Set(manifest?.threshold_stages ?? []);
  for (const metric of REQUIRED_METRICS) if (!metrics.has(metric)) errors.push(error("required_metric_missing", "$.metrics", metric));
  for (const scenario of REQUIRED_SCENARIOS) if (!scenarios.has(scenario)) errors.push(error("required_scenario_missing", "$.cases", scenario));
  for (const stage of REQUIRED_THRESHOLD_STAGES) if (!stages.has(stage)) errors.push(error("required_threshold_stage_missing", "$.threshold_stages", stage));
  return { valid: errors.length === 0, errors };
}

export function findEvaluationCase(manifest, scenario) {
  return manifest.cases.find((entry) => entry.scenario === scenario);
}
