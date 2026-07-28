import Ajv2020 from "ajv/dist/2020.js";
import schema from "../../schemas/analysis/scholarship-analysis-v1.schema.json" with { type: "json" };
import {
  analysisSha256,
  stableAnalysisUuid,
} from "./analysis-identifiers.mjs";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

export function validateAnalysisSchema(result) {
  const valid = validateSchema(result);
  return {
    valid: Boolean(valid),
    errors: valid
      ? []
      : (validateSchema.errors ?? []).map((entry) => ({
        code: "schema_invalid",
        path: entry.instancePath || "/",
        message: entry.message ?? "schema validation failed",
      })),
  };
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getPath(value, path) {
  const segments = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if (current == null || !(segment in Object(current))) return undefined;
    current = current[segment];
  }
  return current;
}

function evidenceSource(input, evidence) {
  if (evidence.source_kind === "body_text") {
    return evidence.source_id === input.lineage.revision_id ? input.notice.body : null;
  }
  const asset = input.attachments.find((row) => row.asset_id === evidence.source_id);
  return asset?.text ?? null;
}

function assertedFieldPaths(result) {
  const paths = [];
  const visit = (value, path) => {
    if (path === "evidence" || path.startsWith("evidence.")) return;
    if (value == null || value === "" || value === "unknown") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key));
      return;
    }
    if (
      !path.startsWith("lineage.")
      && !path.endsWith(".confidence")
      && path !== "notice_classification"
      && !path.startsWith("unresolved_fields")
    ) {
      paths.push(path);
    }
  };
  visit(result, "");
  return paths;
}

export function parseStructuredAnalysisResponse(raw) {
  if (raw && typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw ?? ""));
  } catch (error) {
    throw Object.assign(new Error("provider_response_json_invalid"), {
      code: "json_invalid",
      cause: error,
    });
  }
}

export function validateStructuredAnalysis(result, {
  analysisInput,
  requireEvidenceForAssertions = true,
} = {}) {
  const errors = [];
  const schemaValidation = validateAnalysisSchema(result);
  if (!schemaValidation.valid) {
    errors.push(...schemaValidation.errors);
    return { valid: false, validation_status: "schema_invalid", errors };
  }
  if (
    result.lineage.notice_id !== analysisInput?.lineage?.notice_id
    || result.lineage.revision_id !== analysisInput?.lineage?.revision_id
  ) {
    errors.push({ code: "lineage_invalid", path: "lineage", message: "result lineage mismatch" });
  }
  for (const evidence of result.evidence) {
    const field = getPath(result, evidence.field_path);
    if (field === undefined || evidence.field_path.startsWith("evidence")) {
      errors.push({
        code: "evidence_field_missing",
        path: evidence.field_path,
        message: "evidence references a missing result field",
      });
      continue;
    }
    const sourceText = evidenceSource(analysisInput, evidence);
    if (!sourceText) {
      errors.push({
        code: "evidence_source_missing",
        path: evidence.field_path,
        message: "evidence source is not in the analysis input",
      });
    } else if (!clean(sourceText).includes(clean(evidence.quote))) {
      errors.push({
        code: "evidence_quote_not_found",
        path: evidence.field_path,
        message: "quoted evidence is not present in its source",
      });
    }
  }
  if (requireEvidenceForAssertions) {
    const evidencePaths = new Set(result.evidence.map((entry) => entry.field_path));
    for (const path of assertedFieldPaths(result)) {
      const supported = [...evidencePaths].some((evidencePath) =>
        evidencePath === path
        || evidencePath.startsWith(`${path}.`)
        || path.startsWith(`${evidencePath}.`)
        || path.startsWith(`${evidencePath}[`));
      if (!supported) {
        errors.push({
          code: "assertion_without_evidence",
          path,
          message: "non-null assertion has no field-level evidence",
        });
      }
    }
  }
  const evidenceErrors = errors.some((entry) => entry.code.startsWith("evidence_")
    || entry.code === "assertion_without_evidence");
  return {
    valid: errors.length === 0,
    validation_status: errors.length === 0
      ? "validated"
      : (evidenceErrors ? "evidence_invalid" : "semantic_invalid"),
    errors,
  };
}

export function buildAnalysisArtifacts({
  job,
  run,
  structuredResult,
  now = new Date().toISOString(),
}) {
  const resultFingerprint = analysisSha256(JSON.stringify(structuredResult));
  const resultId = stableAnalysisUuid(
    "notice_analysis_results",
    `${run.id}|${resultFingerprint}`,
  );
  const result = {
    id: resultId,
    job_id: job.id,
    run_id: run.id,
    notice_id: job.notice_id,
    revision_id: job.revision_id,
    result_status: "validated",
    analysis_schema_version: job.schema_version,
    structured_result: structuredResult,
    result_fingerprint: resultFingerprint,
    validation_errors: [],
    confidence_summary: {},
    requires_human_review: true,
    created_at: now,
    superseded_at: null,
  };
  const evidence = structuredResult.evidence.map((entry) => {
    const evidenceFingerprint = analysisSha256(JSON.stringify({
      field_path: entry.field_path,
      source_kind: entry.source_kind,
      source_id: entry.source_id,
      locator: entry.locator,
      quote: entry.quote,
    }));
    return {
    id: stableAnalysisUuid(
      "notice_analysis_evidence",
      `${resultId}|${entry.field_path}|${evidenceFingerprint}`,
    ),
    result_id: resultId,
    field_path: entry.field_path,
    evidence_kind: entry.source_kind,
    source_revision_id: job.revision_id,
    source_asset_id: entry.source_kind === "attachment_text" ? entry.source_id : null,
    source_locator: entry.locator,
    quoted_text: entry.quote,
    normalized_value: getPath(structuredResult, entry.field_path) ?? null,
    confidence: entry.confidence,
    evidence_fingerprint: evidenceFingerprint,
    created_at: now,
  };
  });
  return { result, evidence };
}
