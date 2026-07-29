import { normalizeContact, normalizeKoreanAmount, normalizeKoreanDateRange } from "./deterministic-normalizers.mjs";

export const SEGMENT_REFERENCE_V3_MODEL = "claude-sonnet-4-6";
export const MAX_SEGMENT_REFERENCE_V3_PROVIDER_CALLS = 4;
export const SEGMENT_REFERENCE_V3_SCHEMA_VERSION = "segment-reference-extraction-v3";
export const SCHOLARSHIP_ORGANIZATION_ROLES = ["funding_provider", "program_operator", "application_operator", "recommending_institution", "selection_body", "other"];

const nullableString = { type: ["string", "null"] };
const refs = { type: "array", items: { type: "string" } };
const claim = { type: "object", additionalProperties: false, required: ["semantic_value", "source_refs"], properties: { semantic_value: nullableString, source_refs: refs } };
const list = (properties) => ({ type: "object", additionalProperties: false, required: [...Object.keys(properties), "source_refs"], properties: { ...properties, source_refs: refs } });

export const segmentReferenceV3OutputSchema = {
  type: "object", additionalProperties: false,
  required: ["scholarship_name", "publishing_department", "scholarship_organizations", "eligibility", "benefits", "application_periods", "required_documents", "application_methods", "important_constraints", "contacts", "unknown_or_ambiguous"],
  properties: {
    scholarship_name: claim,
    publishing_department: claim,
    scholarship_organizations: { type: "array", items: list({ role: { type: "string", enum: SCHOLARSHIP_ORGANIZATION_ROLES }, semantic_value: { type: "string" } }) },
    eligibility: { type: "array", items: list({ category: { type: "string" }, semantic_value: { type: "string" } }) },
    benefits: { type: "array", items: list({ benefit_type: { type: "string" }, semantic_value: { type: "string" }, raw_amount_text: nullableString }) },
    application_periods: { type: "array", items: list({ label: nullableString, raw_start: nullableString, raw_end: nullableString }) },
    required_documents: { type: "array", items: list({ semantic_value: { type: "string" } }) },
    application_methods: { type: "array", items: list({ method_type: { type: "string" }, semantic_value: { type: "string" } }) },
    important_constraints: { type: "array", items: list({ category: { type: "string" }, semantic_value: { type: "string" } }) },
    contacts: { type: "array", items: list({ contact_type: { type: "string" }, raw_value: { type: "string" } }) },
    unknown_or_ambiguous: { type: "array", items: { type: "string" } },
  },
};

const topKeys = Object.keys(segmentReferenceV3OutputSchema.properties);
const criticalLists = new Set(["eligibility", "benefits", "application_periods", "required_documents", "application_methods", "important_constraints"]);
const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const isStringOrNull = (value) => typeof value === "string" || value === null;
const onlyKeys = (value, keys) => isObject(value) && Object.keys(value).every((key) => keys.includes(key));
const validRefs = (value, map) => Array.isArray(value) && value.length > 0 && value.every((ref) => typeof ref === "string" && map.has(ref));
const rawInRefs = (value, sourceRefs, map) => value == null || (sourceRefs ?? []).some((ref) => map.get(ref)?.text.includes(value));

function checkClaim(errors, item, path, map, keys, critical = false, allowNullSemantic = false) {
  if (!onlyKeys(item, [...keys, "source_refs"]) || keys.some((key) => !(key in item)) || !Array.isArray(item?.source_refs)) return errors.push(`schema:${path}`);
  if (keys.some((key) => !isStringOrNull(item[key]) || (key === "semantic_value" && item[key] === null && !allowNullSemantic))) errors.push(`schema:${path}`);
  const substantive = keys.some((key) => item[key] !== null && item[key] !== "");
  if ((critical || substantive) && !validRefs(item.source_refs, map)) errors.push(`invalid_source_refs:${path}`);
  else if (!item.source_refs.every((ref) => map.has(ref))) errors.push(`invalid_source_refs:${path}`);
}

export function validateSegmentReferenceV3Output(output, segments) {
  const errors = [];
  const map = new Map((segments ?? []).map((segment) => [segment.segment_id, segment]));
  if (!onlyKeys(output, topKeys) || topKeys.some((key) => !(key in output))) return { valid: false, errors: ["schema:top_level"] };
  for (const forbidden of ["organizer", "source_context", "publishing_institution", "evidence", "evidence_text", "quote"]) if (JSON.stringify(output).includes(`\"${forbidden}\"`)) errors.push(`schema:forbidden_field:${forbidden}`);
  for (const field of ["scholarship_name", "publishing_department"]) checkClaim(errors, output[field], field, map, ["semantic_value"], false, true);
  const lists = { scholarship_organizations: ["role", "semantic_value"], eligibility: ["category", "semantic_value"], benefits: ["benefit_type", "semantic_value", "raw_amount_text"], application_periods: ["label", "raw_start", "raw_end"], required_documents: ["semantic_value"], application_methods: ["method_type", "semantic_value"], important_constraints: ["category", "semantic_value"], contacts: ["contact_type", "raw_value"] };
  for (const [field, keys] of Object.entries(lists)) {
    if (!Array.isArray(output[field])) { errors.push(`schema:${field}`); continue; }
    output[field].forEach((item, index) => {
      const path = `${field}[${index}]`;
      checkClaim(errors, item, path, map, keys, criticalLists.has(field));
      if (field === "scholarship_organizations" && !SCHOLARSHIP_ORGANIZATION_ROLES.includes(item?.role)) errors.push(`invalid_organization_role:${path}`);
      if (field === "application_periods") for (const key of ["raw_start", "raw_end"]) if (!rawInRefs(item?.[key], item?.source_refs, map)) errors.push(`raw_value_not_found:${path}.${key}`);
      if (field === "benefits" && !rawInRefs(item?.raw_amount_text, item?.source_refs, map)) errors.push(`raw_value_not_found:${path}.raw_amount_text`);
      if (field === "contacts" && !rawInRefs(item?.raw_value, item?.source_refs, map)) errors.push(`raw_value_not_found:${path}.raw_value`);
    });
  }
  if (!Array.isArray(output.unknown_or_ambiguous) || output.unknown_or_ambiguous.some((value) => typeof value !== "string")) errors.push("schema:unknown_or_ambiguous");
  return { valid: errors.length === 0, errors };
}

export function reconstructV3Evidence(output, segments, sourceContext) {
  const map = new Map(segments.map((segment) => [segment.segment_id, segment]));
  const attach = (item) => ({ ...item, evidence: item.source_refs.map((segment_id) => ({ segment_id, text: map.get(segment_id)?.text ?? null })) });
  return { source_context: sourceContext, scholarship_name: attach(output.scholarship_name), publishing_department: attach(output.publishing_department), scholarship_organizations: output.scholarship_organizations.map(attach), eligibility: output.eligibility.map(attach), benefits: output.benefits.map((item) => ({ ...attach(item), normalized_amount: normalizeKoreanAmount(item.raw_amount_text) })), application_periods: output.application_periods.map((item) => ({ ...attach(item), normalized_period: normalizeKoreanDateRange(item.raw_start, item.raw_end) })), required_documents: output.required_documents.map(attach), application_methods: output.application_methods.map(attach), important_constraints: output.important_constraints.map(attach), contacts: output.contacts.map((item) => ({ ...attach(item), normalized_contact: normalizeContact(item.raw_value) })), unknown_or_ambiguous: output.unknown_or_ambiguous };
}

export function assessOrganizationTaxonomy(output, segments, sourceContext) {
  const map = new Map(segments.map((segment) => [segment.segment_id, segment]));
  const department = output.publishing_department;
  const departmentText = (department?.source_refs ?? []).map((ref) => map.get(ref)?.text ?? "").join(" ");
  const departmentAssessment = typeof department?.semantic_value !== "string" ? "NOT_PRESENT" : departmentText.includes(department.semantic_value) ? "PENDING_MANUAL_REVIEW" : department.semantic_value.includes(sourceContext.publishing_institution) ? "UNSUPPORTED_CONTEXT_EXPANSION" : "UNSUPPORTED";
  const organizations = (output.scholarship_organizations ?? []).map((item) => ({ role: item.role, semantic_value: item.semantic_value, assessment: ["funding_provider", "program_operator"].includes(item.role) && (item.semantic_value === sourceContext.publishing_institution || item.semantic_value === output.publishing_department?.semantic_value) ? "ROLE_CONFUSION" : "PENDING_MANUAL_REVIEW" }));
  return { publishing_department: departmentAssessment, scholarship_organizations: organizations };
}

export function buildSegmentReferenceV3Prompt(record, segments, sourceContext) {
  return `You are mapping source segments to scholarship-information fields. Return JSON only. The trusted publishing institution is ${sourceContext.publishing_institution}; it is metadata, not an output field. Do not include it in publishing_department unless those exact words are in the selected segment. Return semantic_value and source_refs only; never write evidence quotations. Determine publishing_department separately from scholarship_organizations. For each scholarship organization choose only one allowed role: ${SCHOLARSHIP_ORGANIZATION_ROLES.join(", ")}. Do not infer dates, amounts, eligibility, procedures, documents, or organization roles. raw_start, raw_end, raw_amount_text, and raw_value must be exact substrings of source_refs. Use null or [] when unsupported. Return JSON only.\n\nNotice: ${record.source_id}/${record.article_id}; title: ${record.title}\n\nSegments:\n${segments.map((segment) => `[${segment.segment_id}] ${segment.text}`).join("\n")}`;
}
