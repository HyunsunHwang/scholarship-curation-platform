import { normalizeContact, normalizeKoreanAmount, normalizeKoreanDateRange } from "./deterministic-normalizers.mjs";

export const SEGMENT_REFERENCE_EVALUATION_MODEL = "claude-sonnet-4-6";
export const MAX_SEGMENT_REFERENCE_PROVIDER_CALLS = 4;
export const SEGMENT_REFERENCE_SCHEMA_VERSION = "segment-reference-extraction-v2";

const nullableString = { type: ["string", "null"] };
const sourceRefs = { type: "array", minItems: 0, items: { type: "string" } };
const semanticClaim = { type: "object", additionalProperties: false, required: ["semantic_value", "source_refs"], properties: { semantic_value: nullableString, source_refs: { ...sourceRefs } } };
const listClaim = (properties) => ({ type: "object", additionalProperties: false, required: [...Object.keys(properties), "source_refs"], properties: { ...properties, source_refs: { ...sourceRefs } } });

export const segmentReferenceOutputSchema = {
  type: "object", additionalProperties: false,
  required: ["scholarship_name", "organizer", "eligibility", "benefits", "application_periods", "required_documents", "application_methods", "important_constraints", "contacts", "unknown_or_ambiguous"],
  properties: {
    scholarship_name: semanticClaim,
    organizer: semanticClaim,
    eligibility: { type: "array", items: listClaim({ category: { type: "string" }, semantic_value: { type: "string" } }) },
    benefits: { type: "array", items: listClaim({ benefit_type: { type: "string" }, semantic_value: { type: "string" }, raw_amount_text: nullableString }) },
    application_periods: { type: "array", items: listClaim({ label: nullableString, raw_start: nullableString, raw_end: nullableString }) },
    required_documents: { type: "array", items: listClaim({ semantic_value: { type: "string" } }) },
    application_methods: { type: "array", items: listClaim({ method_type: { type: "string" }, semantic_value: { type: "string" } }) },
    important_constraints: { type: "array", items: listClaim({ category: { type: "string" }, semantic_value: { type: "string" } }) },
    contacts: { type: "array", items: listClaim({ contact_type: { type: "string" }, raw_value: { type: "string" } }) },
    unknown_or_ambiguous: { type: "array", items: { type: "string" } },
  },
};

const topKeys = Object.keys(segmentReferenceOutputSchema.properties);
const criticalLists = new Set(["eligibility", "benefits", "application_periods", "required_documents", "application_methods", "important_constraints"]);
const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const isStringOrNull = (value) => typeof value === "string" || value === null;
const hasOnlyKeys = (value, keys) => isObject(value) && Object.keys(value).every((key) => keys.includes(key));
const refsAreValid = (refs, segmentMap) => Array.isArray(refs) && refs.length > 0 && refs.every((ref) => typeof ref === "string" && segmentMap.has(ref));
const rawInRefs = (raw, refs, segmentMap) => raw == null || refs.some((ref) => segmentMap.get(ref).text.includes(raw));

function validateClaim(errors, claim, path, segmentMap, { critical = false, requiredKeys = ["semantic_value"] } = {}) {
  if (!isObject(claim) || !hasOnlyKeys(claim, [...requiredKeys, "source_refs"]) || requiredKeys.some((key) => !(key in claim))) return errors.push(`schema:${path}`);
  if (!Array.isArray(claim.source_refs) || !claim.source_refs.every((ref) => typeof ref === "string")) return errors.push(`schema:source_refs:${path}`);
  const substantive = requiredKeys.some((key) => claim[key] !== null && claim[key] !== "");
  if ((critical || substantive) && !refsAreValid(claim.source_refs, segmentMap)) errors.push(`invalid_source_refs:${path}`);
  else if (!claim.source_refs.every((ref) => segmentMap.has(ref))) errors.push(`invalid_source_refs:${path}`);
}

export function validateSegmentReferenceOutput(output, segments) {
  const errors = [];
  const segmentMap = new Map((segments ?? []).map((segment) => [segment.segment_id, segment]));
  if (!isObject(output) || !hasOnlyKeys(output, topKeys) || topKeys.some((key) => !(key in output))) return { valid: false, errors: ["schema:top_level"] };
  for (const forbidden of ["evidence", "evidence_text", "quote"]) if (JSON.stringify(output).includes(`\"${forbidden}\"`)) errors.push(`schema:forbidden_evidence_field:${forbidden}`);
  for (const field of ["scholarship_name", "organizer"]) {
    validateClaim(errors, output[field], field, segmentMap, { requiredKeys: ["semantic_value"] });
    if (!isStringOrNull(output[field]?.semantic_value)) errors.push(`schema:${field}.semantic_value`);
  }
  const lists = {
    eligibility: ["category", "semantic_value"], benefits: ["benefit_type", "semantic_value", "raw_amount_text"], application_periods: ["label", "raw_start", "raw_end"], required_documents: ["semantic_value"], application_methods: ["method_type", "semantic_value"], important_constraints: ["category", "semantic_value"], contacts: ["contact_type", "raw_value"],
  };
  for (const [field, keys] of Object.entries(lists)) {
    if (!Array.isArray(output[field])) { errors.push(`schema:${field}`); continue; }
    output[field].forEach((claim, index) => {
      validateClaim(errors, claim, `${field}[${index}]`, segmentMap, { critical: criticalLists.has(field), requiredKeys: keys });
      for (const key of keys) if (!(key in claim) || !isStringOrNull(claim[key]) || (key === "semantic_value" && claim[key] === null)) errors.push(`schema:${field}[${index}].${key}`);
      if (field === "application_periods") {
        if (!rawInRefs(claim.raw_start, claim.source_refs ?? [], segmentMap)) errors.push(`raw_value_not_found:${field}[${index}].raw_start`);
        if (!rawInRefs(claim.raw_end, claim.source_refs ?? [], segmentMap)) errors.push(`raw_value_not_found:${field}[${index}].raw_end`);
      }
      if (field === "benefits" && !rawInRefs(claim.raw_amount_text, claim.source_refs ?? [], segmentMap)) errors.push(`raw_value_not_found:${field}[${index}].raw_amount_text`);
      if (field === "contacts" && !rawInRefs(claim.raw_value, claim.source_refs ?? [], segmentMap)) errors.push(`raw_value_not_found:${field}[${index}].raw_value`);
    });
  }
  if (!Array.isArray(output.unknown_or_ambiguous) || output.unknown_or_ambiguous.some((value) => typeof value !== "string")) errors.push("schema:unknown_or_ambiguous");
  return { valid: errors.length === 0, errors };
}

export function reconstructEvidence(output, segments) {
  const segmentMap = new Map(segments.map((segment) => [segment.segment_id, segment]));
  const attach = (claim) => ({ ...claim, evidence: (claim.source_refs ?? []).map((segment_id) => ({ segment_id, text: segmentMap.get(segment_id)?.text ?? null })) });
  return {
    scholarship_name: attach(output.scholarship_name), organizer: attach(output.organizer),
    eligibility: output.eligibility.map(attach), benefits: output.benefits.map((claim) => ({ ...attach(claim), normalized_amount: normalizeKoreanAmount(claim.raw_amount_text) })),
    application_periods: output.application_periods.map((claim) => ({ ...attach(claim), normalized_period: normalizeKoreanDateRange(claim.raw_start, claim.raw_end) })),
    required_documents: output.required_documents.map(attach), application_methods: output.application_methods.map(attach), important_constraints: output.important_constraints.map(attach), contacts: output.contacts.map((claim) => ({ ...attach(claim), normalized_contact: normalizeContact(claim.raw_value) })), unknown_or_ambiguous: output.unknown_or_ambiguous,
  };
}

export function buildSegmentReferencePrompt(record, segments) {
  return `You are not writing a summary or an answer for a user. Map supplied source segments to scholarship-information fields. For each supported field, return a concise semantic_value that preserves scope and only the supporting segment IDs in source_refs. Do not write, paraphrase, reconstruct, or fabricate any evidence quotation. Do not infer missing dates, amounts, eligibility conditions, procedures, or documents. Use null or [] if unsupported. Do not merge mandatory requirements, preferences, exceptions, or warnings. raw_start, raw_end, raw_amount_text, and raw_value must be exact substrings of the selected source_refs. Return JSON only.\n\nNotice metadata:\nsource_id: ${record.source_id}\narticle_id: ${record.article_id}\ntitle: ${record.title}\npublished_at: ${record.published_at}\n\nSegments:\n${segments.map((segment) => `[${segment.segment_id}] ${segment.text}`).join("\n")}`;
}
