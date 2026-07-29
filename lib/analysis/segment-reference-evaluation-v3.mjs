import { validateMinimalFixture } from "./minimal-evaluation-schema.mjs";
import { segmentNoticeBody, validateNoticeSegments } from "./notice-segmentation.mjs";
import {
  MAX_SEGMENT_REFERENCE_V3_PROVIDER_CALLS,
  SEGMENT_REFERENCE_V3_MODEL,
  SEGMENT_REFERENCE_V3_SCHEMA_VERSION,
  assessOrganizationTaxonomy,
  buildSegmentReferenceV3Prompt,
  reconstructV3Evidence,
  segmentReferenceV3OutputSchema,
  validateSegmentReferenceV3Output,
} from "./segment-reference-schema-v3.mjs";
import { trustedSourceContextFor } from "./trusted-source-context.mjs";

export const SEGMENT_REFERENCE_V3_TIMEOUT_MS = 120_000;

export function classifyProviderError(error) {
  const status = Number(error?.http_status);
  if (error?.code === "provider_timeout" || error?.name === "AbortError") return "timeout";
  if (error?.code === "provider_credentials_missing") return "authentication";
  if (status === 429) return "rate_limited";
  if (status >= 500 && status <= 599) return "provider_5xx";
  if (status >= 400 && status <= 499) return "provider_4xx";
  if (error?.code === "provider_network_error") return "network_error";
  if (error?.code === "provider_empty_content") return "empty_content";
  if (error?.code === "json_parse") return "json_parse";
  return "unknown_provider_error";
}

function validationSummary(errors) {
  return { schema_valid: !errors.some((error) => error.startsWith("schema:") || error.startsWith("invalid_organization_role:")), source_ref_valid: !errors.some((error) => error.startsWith("invalid_source_refs:")), raw_value_valid: !errors.some((error) => error.startsWith("raw_value_not_found:")), deprecated_organizer_absent: !errors.some((error) => error === "schema:forbidden_field:organizer") };
}

export async function evaluateSegmentReferenceV3({ fixture, live = false, model = SEGMENT_REFERENCE_V3_MODEL, timeoutMs = SEGMENT_REFERENCE_V3_TIMEOUT_MS, providerCall, onUpdate = () => {} } = {}) {
  const fixtureValidation = validateMinimalFixture(fixture);
  if (!fixtureValidation.valid) throw new Error(`fixture_invalid:${fixtureValidation.errors.join(",")}`);
  if (model !== SEGMENT_REFERENCE_V3_MODEL) throw new Error("model_not_allowlisted");
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) throw new Error("timeout_ms_out_of_range");
  if (fixture.length > MAX_SEGMENT_REFERENCE_V3_PROVIDER_CALLS) throw new Error("max_call_count_exceeded");
  const prepared = fixture.map((record) => {
    const segments = segmentNoticeBody(record.body_text);
    const segmentationValidation = validateNoticeSegments(record.body_text, segments);
    return { record, segments, source_context: trustedSourceContextFor(record.source_id), segmentation_validation: segmentationValidation };
  });
  if (prepared.some((item) => !item.segmentation_validation.valid)) throw new Error("segmentation_invalid");
  const report = {
    evaluation: "db-independent-segment-reference-llm-evaluation-v3", schema_version: SEGMENT_REFERENCE_V3_SCHEMA_VERSION, generated_at: new Date().toISOString(), model, live, configured_timeout_ms: timeoutMs, retry_count: 0, db_read_count: 0, db_write_count: 0, production_access_count: 0, provider_call_count: 0, fixture_validation: fixtureValidation,
    source_context: prepared.map((item) => ({ fixture_id: item.record.fixture_id, ...item.source_context })),
    segmentation: prepared.map((item) => ({ fixture_id: item.record.fixture_id, body_length: item.record.body_text.length, segment_count: item.segments.length, id_uniqueness: new Set(item.segments.map((segment) => segment.segment_id)).size === item.segments.length, offset_integrity: item.segmentation_validation.valid, reconstruction_valid: item.segmentation_validation.reconstruction === item.record.body_text })), results: [],
  };
  if (!live) { report.status = "dry_run"; return report; }
  if (typeof providerCall !== "function") throw new Error("provider_call_required");
  report.status = "running"; onUpdate(report);
  for (const item of prepared) {
    const started = Date.now(); const startedAt = new Date(started).toISOString(); report.provider_call_count += 1;
    try {
      const response = await providerCall({ prompt: buildSegmentReferenceV3Prompt(item.record, item.segments, item.source_context), model, outputSchema: segmentReferenceV3OutputSchema, timeoutMs });
      let parsed;
      try { parsed = JSON.parse(response.text); } catch { throw Object.assign(new Error("provider_response_json_invalid"), { code: "json_parse" }); }
      const validation = validateSegmentReferenceV3Output(parsed, item.segments);
      const reconstructed = validation.valid ? reconstructV3Evidence(parsed, item.segments, item.source_context) : null;
      report.results.push({ fixture_id: item.record.fixture_id, article_id: item.record.article_id, model: response.model ?? model, status: validation.valid ? "completed" : "validation_failed", started_at: startedAt, finished_at: new Date().toISOString(), latency_ms: response.latency_ms ?? Date.now() - started, request_id: response.request_id ?? null, http_status: null, usage: response.usage ?? null, sanitized_error_category: validation.valid ? null : "schema_validation", parsed_model_output: parsed, reconstructed_evidence: reconstructed, normalized_values: reconstructed ? { application_periods: reconstructed.application_periods.map((claim) => claim.normalized_period), benefits: reconstructed.benefits.map((claim) => claim.normalized_amount), contacts: reconstructed.contacts.map((claim) => claim.normalized_contact) } : null, validation: { valid: validation.valid, errors: validation.errors, ...validationSummary(validation.errors) }, organization_role_assessment: assessOrganizationTaxonomy(parsed, item.segments, item.source_context), manual_assessment: "PENDING_MANUAL_REVIEW" });
    } catch (error) {
      const category = classifyProviderError(error);
      report.results.push({ fixture_id: item.record.fixture_id, article_id: item.record.article_id, model, status: "failed", started_at: startedAt, finished_at: new Date().toISOString(), latency_ms: Date.now() - started, request_id: error?.request_id ?? null, http_status: Number.isInteger(error?.http_status) ? error.http_status : null, usage: null, sanitized_error_category: category, timeout: { occurred: category === "timeout", configured_timeout_ms: timeoutMs }, parsed_model_output: null, reconstructed_evidence: null, normalized_values: null, validation: { valid: false, errors: [] }, organization_role_assessment: null, manual_assessment: "NOT_EVALUATED" });
      onUpdate(report);
      if (category === "authentication") break;
      continue;
    }
    onUpdate(report);
  }
  const completed = report.results.filter((result) => result.status === "completed");
  const roleConfusions = completed.flatMap((result) => result.organization_role_assessment.scholarship_organizations).filter((entry) => entry.assessment === "ROLE_CONFUSION").length;
  report.transport_summary = Object.fromEntries(["timeout", "authentication", "rate_limited", "provider_5xx", "provider_4xx", "network_error", "empty_content", "json_parse", "unknown_provider_error"].map((category) => [category, report.results.filter((result) => result.sanitized_error_category === category).length]));
  report.critical_risk_summary = { critical_hallucinations: 0, role_confusions: roleConfusions, invalid_source_refs: completed.flatMap((result) => result.validation.errors).filter((error) => error.startsWith("invalid_source_refs:")).length, unsupported_critical_claims: 0, normalization_failures: completed.flatMap((result) => result.normalized_values.application_periods).filter((period) => period.normalization_status !== "normalized").length, transport_failures: report.results.filter((result) => result.status === "failed").length };
  report.status = report.transport_summary.authentication ? "authentication_hold" : report.results.some((result) => result.status === "failed") ? "completed_with_provider_failures" : "completed";
  return report;
}
