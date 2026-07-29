import crypto from "node:crypto";

export const MINIMAL_EVALUATION_MODEL = "claude-sonnet-4-6";
export const MAX_MINIMAL_EVALUATION_CALLS = 4;

const valueEvidence = {
  type: "object", additionalProperties: false,
  required: ["value", "evidence"],
  properties: { value: { type: ["string", "null"] }, evidence: { type: "array", items: { type: "string" } } },
};
const evidencedString = {
  type: "object", additionalProperties: false,
  required: ["condition", "evidence"],
  properties: { condition: { type: "string" }, evidence: { type: "string" } },
};

export const minimalEvaluationOutputSchema = {
  type: "object", additionalProperties: false,
  required: ["scholarship_name", "organizer", "eligibility", "benefits", "application_period", "required_documents", "application_method", "important_constraints", "contact", "unknown_or_ambiguous"],
  properties: {
    scholarship_name: valueEvidence,
    organizer: valueEvidence,
    eligibility: { type: "array", items: evidencedString },
    benefits: { type: "array", items: { type: "object", additionalProperties: false, required: ["description", "amount_krw", "evidence"], properties: { description: { type: "string" }, amount_krw: { type: ["number", "null"] }, evidence: { type: "string" } } } },
    application_period: { type: "object", additionalProperties: false, required: ["start", "end", "raw_text", "evidence"], properties: { start: { type: ["string", "null"] }, end: { type: ["string", "null"] }, raw_text: { type: ["string", "null"] }, evidence: { type: "array", items: { type: "string" } } } },
    required_documents: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "evidence"], properties: { name: { type: "string" }, evidence: { type: "string" } } } },
    application_method: { type: "array", items: { type: "object", additionalProperties: false, required: ["method", "evidence"], properties: { method: { type: "string" }, evidence: { type: "string" } } } },
    important_constraints: { type: "array", items: { type: "object", additionalProperties: false, required: ["constraint", "evidence"], properties: { constraint: { type: "string" }, evidence: { type: "string" } } } },
    contact: { type: "array", items: { type: "object", additionalProperties: false, required: ["value", "evidence"], properties: { value: { type: "string" }, evidence: { type: "string" } } } },
    unknown_or_ambiguous: { type: "array", items: { type: "string" } },
  },
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value, keys) => isObject(value) && Object.keys(value).every((key) => keys.includes(key));
const hasEvidence = (evidence) => Array.isArray(evidence) && evidence.some((item) => clean(item));

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function validateMinimalFixture(records) {
  const errors = [];
  if (!Array.isArray(records) || records.length !== 4) errors.push("fixture_must_contain_exactly_four_records");
  const ids = new Set(); const urls = new Set();
  for (const row of records ?? []) {
    if (row?.source_id !== "ewha_068") errors.push(`invalid_source:${row?.fixture_id ?? "unknown"}`);
    for (const field of ["fixture_id", "article_id", "title", "published_at", "original_url", "body_text", "body_sha256", "retrieved_at"]) {
      if (!clean(row?.[field])) errors.push(`missing_${field}:${row?.fixture_id ?? "unknown"}`);
    }
    if (!datePattern.test(String(row?.published_at ?? ""))) errors.push(`invalid_published_at:${row?.fixture_id ?? "unknown"}`);
    if (!Array.isArray(row?.attachments)) errors.push(`invalid_attachments:${row?.fixture_id ?? "unknown"}`);
    if (row?.body_sha256 && row.body_sha256 !== sha256(row.body_text)) errors.push(`body_hash_mismatch:${row.fixture_id}`);
    if (ids.has(row?.article_id)) errors.push(`duplicate_article_id:${row?.article_id}`); ids.add(row?.article_id);
    if (urls.has(row?.original_url)) errors.push(`duplicate_original_url:${row?.original_url}`); urls.add(row?.original_url);
  }
  return { valid: errors.length === 0, errors };
}

export function buildMinimalEvaluationPrompt(record) {
  return `You are extracting scholarship-notice facts. Return JSON only that exactly conforms to the provided schema.\n\nRules: never infer facts not stated in body_text; use null, [] or unknown_or_ambiguous when uncertain; every non-null claim needs a short exact body_text substring as evidence; do not infer attachment contents from names; do not add a year to a date that omits one; distinguish school recommendation from student application; report title/body conflicts in unknown_or_ambiguous.\n\nFixture metadata:\nsource_id: ${record.source_id}\narticle_id: ${record.article_id}\ntitle: ${record.title}\npublished_at: ${record.published_at}\noriginal_url: ${record.original_url}\nattachments (metadata only): ${JSON.stringify(record.attachments)}\n\nbody_text:\n${record.body_text}`;
}

function evidenceInBody(body, evidence) {
  return clean(body).includes(clean(evidence));
}
function requireEvidencedString(errors, value, path, body) {
  if (!isObject(value) || !onlyKeys(value, ["value", "evidence"]) || !(typeof value.value === "string" || value.value === null) || !Array.isArray(value.evidence)) { errors.push(`schema:${path}`); return; }
  if (value.value !== null && !hasEvidence(value.evidence)) errors.push(`missing_evidence:${path}`);
  for (const evidence of value.evidence) if (!evidenceInBody(body, evidence)) errors.push(`evidence_not_found:${path}`);
}
function requireList(errors, list, path, body, valueKey) {
  if (!Array.isArray(list)) { errors.push(`schema:${path}`); return; }
  list.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(item) || !onlyKeys(item, [valueKey, "evidence"]) || typeof item[valueKey] !== "string" || typeof item.evidence !== "string") { errors.push(`schema:${itemPath}`); return; }
    if (!clean(item.evidence)) errors.push(`missing_evidence:${itemPath}`);
    else if (!evidenceInBody(body, item.evidence)) errors.push(`evidence_not_found:${itemPath}`);
  });
}

export function validateMinimalEvaluationOutput(output, record) {
  const errors = [];
  const expected = Object.keys(minimalEvaluationOutputSchema.properties);
  if (!isObject(output) || !onlyKeys(output, expected) || expected.some((key) => !(key in output))) return { valid: false, errors: ["schema:top_level"] };
  const body = record?.body_text ?? "";
  requireEvidencedString(errors, output.scholarship_name, "scholarship_name", body);
  requireEvidencedString(errors, output.organizer, "organizer", body);
  requireList(errors, output.eligibility, "eligibility", body, "condition");
  if (!Array.isArray(output.benefits)) errors.push("schema:benefits");
  else output.benefits.forEach((item, index) => {
    const path = `benefits[${index}]`;
    if (!isObject(item) || !onlyKeys(item, ["description", "amount_krw", "evidence"]) || typeof item.description !== "string" || !(typeof item.amount_krw === "number" || item.amount_krw === null) || typeof item.evidence !== "string") errors.push(`schema:${path}`);
    else if (!clean(item.evidence)) errors.push(`missing_evidence:${path}`);
    else if (!evidenceInBody(body, item.evidence)) errors.push(`evidence_not_found:${path}`);
  });
  const period = output.application_period;
  if (!isObject(period) || !onlyKeys(period, ["start", "end", "raw_text", "evidence"]) || !Array.isArray(period.evidence)) errors.push("schema:application_period");
  else {
    for (const key of ["start", "end"]) if (period[key] !== null && !datePattern.test(period[key])) errors.push(`invalid_date:application_period.${key}`);
    if ([period.start, period.end, period.raw_text].some((value) => value !== null) && !hasEvidence(period.evidence)) errors.push("missing_evidence:application_period");
    for (const evidence of period.evidence) if (!evidenceInBody(body, evidence)) errors.push("evidence_not_found:application_period");
  }
  requireList(errors, output.required_documents, "required_documents", body, "name");
  requireList(errors, output.application_method, "application_method", body, "method");
  requireList(errors, output.important_constraints, "important_constraints", body, "constraint");
  requireList(errors, output.contact, "contact", body, "value");
  if (!Array.isArray(output.unknown_or_ambiguous) || output.unknown_or_ambiguous.some((value) => typeof value !== "string")) errors.push("schema:unknown_or_ambiguous");
  return { valid: errors.length === 0, errors };
}

export function criticalEvidenceErrors(errors) {
  return errors.filter((error) => /^(missing_evidence|evidence_not_found):(eligibility|benefits|application_period|required_documents|application_method|important_constraints)/.test(error));
}
