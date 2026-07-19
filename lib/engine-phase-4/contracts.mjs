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
    if (date?.kind === "date_range" && date.start && date.end && Date.parse(date.start) > Date.parse(date.end)) {
      errors.push(error("invalid_date_range", `${fieldPath}.normalized_value`));
    }
    const amount = fieldName === "amount" ? field?.normalized_value : null;
    if (amount?.kind === "range" && Number.isFinite(amount.minimum) && Number.isFinite(amount.maximum) && amount.minimum > amount.maximum) {
      errors.push(error("invalid_amount_range", `${fieldPath}.normalized_value`));
    }
  }

  const documents = new Map((record?.source_documents ?? []).map((document) => [document.document_revision_id, document]));
  for (const item of evidence) {
    if (!item?.document_revision_id) continue;
    const document = documents.get(item.document_revision_id);
    if (!document) {
      errors.push(error("evidence_document_missing", `$.evidence.${item.evidence_id}`, item.document_revision_id));
    } else if (item.document_hash !== document.document_hash) {
      errors.push(error("evidence_document_hash_mismatch", `$.evidence.${item.evidence_id}.document_hash`));
    }
    const span = item.locator?.text_span;
    if (span && span.start >= span.end) {
      errors.push(error("invalid_text_span", `$.evidence.${item.evidence_id}.locator.text_span`));
    }
    if (item.extractor?.kind === "model" && !String(item.inference_reason ?? "").trim()) {
      errors.push(error("model_inference_reason_missing", `$.evidence.${item.evidence_id}.inference_reason`));
    }
  }

  const programId = record?.program_identity_candidate?.candidate_id;
  const cycle = record?.recruitment_cycle_identity_candidate;
  const revision = record?.opportunity_revision;
  const noticeId = record?.source_notice_identity?.notice_id;
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
